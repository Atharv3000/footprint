import React, { useEffect } from 'react';
import { AppState, DeviceEventEmitter, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useAuth } from '@/constants/AuthContext';
import { MEAL_LOGS_CHANGED } from '@/constants/nutritionStorage';
import { WORKOUT_LOGS_CHANGED } from '@/constants/workoutStorage';
import { WALKS_CHANGED } from '@/constants/walkStorage';
import { activateReminderAccount, configureReminderPresentation, recordReminderAppOpen, refreshReminderPlan, reminderOwner, REMINDERS_CHANGED } from '@/constants/engagementNotifications';

/** One event-driven scheduler; no timers or render updates in workout screens. */
export function EngagementNotifications() {
  const {user,profile,isLoading}=useAuth();
  const owner=!isLoading&&profile.hasCompletedSetup?user?.id||null:null;
  useEffect(()=>{
    configureReminderPresentation();
    activateReminderAccount(owner).catch(()=>{});
    if(!owner)return;
    let debounce:ReturnType<typeof setTimeout>|undefined;
    const refresh=()=>{if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>{refreshReminderPlan().catch(()=>{});},500);};
    // Rebuild before marking this open so an old session never crosses account boundaries.
    recordReminderAppOpen(owner).catch(()=>{});
    const events=[MEAL_LOGS_CHANGED,WORKOUT_LOGS_CHANGED,WALKS_CHANGED,REMINDERS_CHANGED].map(event=>DeviceEventEmitter.addListener(event,(payload?:{userId?:string})=>{
      if(!payload?.userId||payload.userId===owner)refresh();
    }));
    const state=AppState.addEventListener('change',value=>{
      if(value==='active') {refresh();recordReminderAppOpen(owner).catch(()=>{});}
      else if(value==='background') {if(debounce)clearTimeout(debounce);refreshReminderPlan().catch(()=>{});}
    });
    return()=>{if(debounce)clearTimeout(debounce);events.forEach(e=>e.remove());state.remove();activateReminderAccount(null).catch(()=>{});};
  },[owner]);
  useEffect(()=>{
    if(Platform.OS==='web'||!owner)return;
    let alive=true;
    const received=new Set<string>();
    const open=(response:Notifications.NotificationResponse|null)=>{
      if(!alive||!response||response.actionIdentifier!==Notifications.DEFAULT_ACTION_IDENTIFIER)return;
      const {identifier,content}=response.notification.request, data=content.data;
      if(data?.source!=='engagement'||data.owner!==owner||reminderOwner()!==owner||received.has(identifier))return;
      received.add(identifier);
      if(data.route==='nutrition')router.push({pathname:'/(tabs)/nutrition',params:{section:data.pet?'pet':'tracker',reminder:identifier}});
      else if(data.route==='log')router.push('/(tabs)/log');
      else if(data.route==='index')router.push('/(tabs)');
      Notifications.clearLastNotificationResponseAsync().catch(()=>{});
    };
    const subscription=Notifications.addNotificationResponseReceivedListener(open);
    Notifications.getLastNotificationResponseAsync().then(open).catch(()=>{});
    return()=>{alive=false;subscription.remove();};
  },[owner]);
  return null;
}
