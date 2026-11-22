import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { buildEngagementPlan, normalizeReminderSettings, type ReminderSettings, type ReminderHistory } from './engagementPlan';
import { loadMealLogs, loadNutritionTargets, loadSavedQuiz } from './nutritionStorage';
import { loadWorkoutLogs, loadCustomRoutines } from './workoutStorage';
import { loadRecordedWalks } from './walkStorage';
import { loadNutritionPetProfile } from './nutritionPetProfile';

export const REMINDERS_CHANGED = 'footprint:reminders-changed';
const PREFIX = 'footprint-engagement-v1:';
const CHANNEL = 'pip-reminders';
const settingsKey = (owner:string) => `@footprint_reminders_v1:${encodeURIComponent(owner)}`;
const historyKey = (owner:string) => `@footprint_reminder_history_v1:${encodeURIComponent(owner)}`;
const openedKey = (owner:string) => `@footprint_last_opened_v1:${encodeURIComponent(owner)}`;
let currentOwner: string | null = null, generation=0;
let jobs: Promise<unknown> = Promise.resolve();
function serial<T>(fn:()=>Promise<T>):Promise<T> { const job=jobs.catch(()=>{}).then(fn);jobs=job;return job; }
export const reminderOwner = () => currentOwner;
const ours = (n: Notifications.NotificationRequest) => n.identifier.startsWith(PREFIX);
function parse(raw:string|null):unknown {try{return raw?JSON.parse(raw):null}catch{return null}}
export async function loadReminderSettings(owner:string):Promise<ReminderSettings> {return normalizeReminderSettings(parse(await AsyncStorage.getItem(settingsKey(owner))));}
export async function saveReminderSettings(owner:string, value:ReminderSettings):Promise<void> {
  await AsyncStorage.setItem(settingsKey(owner),JSON.stringify(normalizeReminderSettings(value)));
  DeviceEventEmitter.emit(REMINDERS_CHANGED,{userId:owner});
}
export async function reminderPermission():Promise<boolean> {
  if(Platform.OS==='web')return false;
  const value=await Notifications.getPermissionsAsync();
  return value.granted || value.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;
}
export async function requestReminderPermission():Promise<boolean> {
  if(Platform.OS==='web')throw Error('Phone notifications are available in the iOS and Android app.');
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Pip reminders',importance:Notifications.AndroidImportance.DEFAULT});
  if(await reminderPermission())return true;
  const value=await Notifications.requestPermissionsAsync({ios:{allowAlert:true,allowBadge:false,allowSound:true}});
  return value.granted || value.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;
}
export function configureReminderPresentation() {
  if(Platform.OS==='web')return;
  Notifications.setNotificationHandler({handleNotification:async notification=>{
    const show=notification.request.content.data?.owner===currentOwner && currentOwner!==null && AppState.currentState!=='active';
    return {shouldShowBanner:show,shouldShowList:show,shouldPlaySound:show,shouldSetBadge:false};
  }});
}
async function cancelOwned(exceptOwner?:string) {
  const requests=await Notifications.getAllScheduledNotificationsAsync();
  for(const request of requests)if(ours(request)&&(!exceptOwner||request.content.data?.owner!==exceptOwner))await Notifications.cancelScheduledNotificationAsync(request.identifier);
  const delivered=await Notifications.getPresentedNotificationsAsync();
  for(const notification of delivered)if(ours(notification.request)&&(!exceptOwner||notification.request.content.data?.owner!==exceptOwner))await Notifications.dismissNotificationAsync(notification.request.identifier);
}
export function activateReminderAccount(owner:string|null):Promise<void> {
  currentOwner=owner;const token=++generation;
  if(Platform.OS==='web')return Promise.resolve();
  return serial(async()=>{
    await cancelOwned(owner||undefined);
    if(owner&&token===generation)await reconcile(owner,token);
  });
}
export function refreshReminderPlan():Promise<void> {
  const owner=currentOwner,token=generation;
  if(!owner||Platform.OS==='web')return Promise.resolve();
  return serial(()=>reconcile(owner,token));
}
export async function recordReminderAppOpen(owner:string):Promise<void> {
  await AsyncStorage.setItem(openedKey(owner),String(Date.now()));
}
async function reconcile(owner:string, token:number):Promise<void> {
  const valid=()=>currentOwner===owner&&generation===token;
  if(!valid())return;
  const settings=await loadReminderSettings(owner);
  if(!valid())return;
  if(!settings.enabled||!(await reminderPermission())) {
    if(valid())await cancelOwned();
    return;
  }
  if(Platform.OS==='android')await Notifications.setNotificationChannelAsync(CHANNEL,{name:'Pip reminders',importance:Notifications.AndroidImportance.DEFAULT});
  const [meals,workouts,walks,routines,targets,quiz,pet,rawHistory,rawOpened] = await Promise.all([
    loadMealLogs(),loadWorkoutLogs(owner),loadRecordedWalks(owner),loadCustomRoutines(owner),loadNutritionTargets(),loadSavedQuiz(),loadNutritionPetProfile(owner),
    AsyncStorage.getItem(historyKey(owner)),AsyncStorage.getItem(openedKey(owner)),
  ]);
  if(!valid())return;
  const now=new Date(),decoded=parse(rawHistory);
  const history:ReminderHistory[]=Array.isArray(decoded)?decoded.filter(h=>h&&typeof h.key==='string'&&typeof h.at==='number'&&Number.isFinite(h.at)&&h.at>now.getTime()-8*86400000&&h.at<=now.getTime()):[];
  const opened=Number(rawOpened);
  const plan=buildEngagementPlan({meals,workouts,walks,routineCount:routines.length,target:targets.dailyCalories,goal:quiz?.goal||'maintain',petName:pet.name,
    lastOpened:opened>0&&Number.isFinite(opened)?opened:null},settings,now,history);
  const scheduled=await Notifications.getAllScheduledNotificationsAsync();
  if(!valid())return;
  const desired=new Map(plan.map(slot=>[`${PREFIX}${encodeURIComponent(owner)}:${slot.key}`,slot]));
  const existing=new Map(scheduled.filter(n=>ours(n)&&!n.identifier.endsWith(':test')).map(n=>[n.identifier,n]));
  for(const request of existing.values()) if(!desired.has(request.identifier)){
    if(!valid())return;
    await Notifications.cancelScheduledNotificationAsync(request.identifier);
  }
  for(const [identifier,slot]of desired) {
    if(!valid())return;
    const signature=JSON.stringify([slot.at,slot.title,slot.body,slot.route,slot.pet]);
    if(existing.get(identifier)?.content.data?.signature===signature)continue;
    if(existing.has(identifier))await Notifications.cancelScheduledNotificationAsync(identifier);
    if(!valid())return;
    await Notifications.scheduleNotificationAsync({identifier,content:{title:slot.title,body:slot.body,sound:'default',
      data:{owner,route:slot.route,pet:slot.pet,source:'engagement',signature}},
      trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(slot.at),channelId:CHANNEL}});
  }
  if(valid())await AsyncStorage.setItem(historyKey(owner),JSON.stringify([...history,...plan.map(({key,at})=>({key,at}))]));
}
export async function sendTestReminder(owner:string):Promise<void> {
  if(owner!==currentOwner)throw Error('Sign in again before testing reminders.');
  if(!(await requestReminderPermission()))throw Error('Allow notifications in your phone settings first.');
  if(owner!==currentOwner)throw Error('Your account changed. Reopen reminder settings.');
  await Notifications.scheduleNotificationAsync({identifier:`${PREFIX}${encodeURIComponent(owner)}:test`,content:{title:'Pip has entered the chat',
    body:'Tiny paws. Big plans. Your reminder is working!',sound:'default',data:{owner,source:'engagement',route:'nutrition',pet:true}},
    trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(Date.now()+5000),channelId:CHANNEL}});
}
