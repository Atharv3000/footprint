import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppModal as Modal } from './AppModal';
import { useTheme, BRAND_ROUNDED_FONT_EXTRA } from '@/constants/ThemeContext';
import { useScreenInsets } from '@/constants/useScreenInsets';
import { DEFAULT_REMINDERS, type ReminderSettings } from '@/constants/engagementPlan';
import { loadReminderSettings, saveReminderSettings, reminderPermission, requestReminderPermission, refreshReminderPlan, sendTestReminder } from '@/constants/engagementNotifications';

export function ReminderSettingsModal({visible,userId,onClose}:{visible:boolean;userId:string;onClose:()=>void}) {
  const {colors}=useTheme(),insets=useScreenInsets();
  const [settings,setSettings]=useState<ReminderSettings>({...DEFAULT_REMINDERS}),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[allowed,setAllowed]=useState(false);
  const [testing,setTesting]=useState(false);
  useEffect(()=>{
    if(!visible)return;
    let alive=true;setReady(false);
    Promise.all([loadReminderSettings(userId),reminderPermission()]).then(([prefs,permission])=>{if(alive){setSettings(prefs);setAllowed(permission);setReady(true);}})
      .catch(()=>{if(alive){setReady(true);Alert.alert('Reminders unavailable','Try reopening reminder settings.');}});
    return()=>{alive=false;};
  },[visible,userId]);
  const change=async(patch:Partial<ReminderSettings>)=>{
    if(busy||!ready)return;
    setBusy(true);
    try{
      if(patch.enabled){
        const granted=await requestReminderPermission();setAllowed(granted);
        if(!granted){Alert.alert('Notifications are turned off','Allow Footprint notifications in your phone settings to let Pip check in.',[
          {text:'Not now',style:'cancel'},{text:'Open settings',onPress:()=>{Linking.openSettings().catch(()=>{});}},
        ]);return;}
      }
      const next={...settings,...patch};
      await saveReminderSettings(userId,next);setSettings(next);
      await refreshReminderPlan();
    }catch(error){Alert.alert('Reminders not updated',error instanceof Error?error.message:'Try again.');}
    finally{setBusy(false);}
  };
  const text={color:colors.text},muted={color:colors.textMuted};
  function option(label:string,description:string,value:boolean,onChange:(value:boolean)=>void){
    return <View style={s.option}><View style={{flex:1,gap:4}}><Text style={[s.label,text]}>{label}</Text><Text style={[s.small,muted]}>{description}</Text></View>
      <Switch accessibilityLabel={label} value={value} disabled={busy||!ready} onValueChange={onChange} trackColor={{false:colors.border,true:colors.primary}} thumbColor="#fff" /></View>;
  }
  function chip(label:string,selected:boolean,onPress:()=>void){return <TouchableOpacity accessibilityRole="radio" accessibilityState={{selected}} disabled={busy||!ready} onPress={onPress}
    style={[s.chip,{backgroundColor:selected?colors.primary:colors.background,borderColor:selected?colors.primary:colors.border}]}><Text style={{color:selected?'#101609':colors.text,fontSize:12,fontWeight:'700'}}>{label}</Text></TouchableOpacity>;}
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={{flex:1,backgroundColor:colors.background,paddingTop:insets.top+12}}>
      <View style={[s.header,{borderColor:colors.border}]}><View style={{flex:1}}><Text style={[s.title,text]}>Pip reminders</Text><Text style={[s.small,muted]}>A little encouragement, on your terms.</Text></View>
        <TouchableOpacity accessibilityLabel="Close reminder settings" onPress={onClose} style={s.close}><Ionicons name="close" size={24} color={colors.text}/></TouchableOpacity></View>
      <ScrollView contentContainerStyle={{padding:20,gap:16,paddingBottom:insets.bottom+30}}>
        {!ready&&<ActivityIndicator color={colors.primary}/>}
        <View style={[s.card,{backgroundColor:colors.surfaceElevated,borderColor:colors.border}]}>
          {option('Let Pip check in',Platform.OS==='web'?'Open the phone app to enable notifications.':'Timely reminders based on your real diary and workouts.',settings.enabled,value=>{change({enabled:value});})}
          {settings.enabled&&!allowed&&<TouchableOpacity onPress={()=>{change({enabled:true});}}><Text style={[s.small,{color:colors.primary}]}>Allow notifications in phone settings</Text></TouchableOpacity>}
          {settings.pausedUntil>Date.now()&&<Text style={[s.small,muted]}>Paused until {new Date(settings.pausedUntil).toLocaleString()}.</Text>}
        </View>
        <View style={[s.card,{backgroundColor:colors.surfaceElevated,borderColor:colors.border}]}>
          <Text style={[s.heading,text]}>What Pip talks about</Text>
          {option('Meal diary','A check-in when logs are quiet. No pressure to eat more or less.',settings.meal,value=>{change({meal:value});})}
          {option('Saved workouts','Occasional nudges for your routines. Rest days welcome.',settings.workout,value=>{change({workout:value});})}
          {option('Check-in streaks','An evening reminder if yesterday’s logging streak can continue.',settings.streak,value=>{change({streak:value});})}
          {option('Gentle comebacks','An open invitation after a few quiet days. No catching up.',settings.comeback,value=>{change({comeback:value});})}
        </View>
        <View style={[s.card,{backgroundColor:colors.surfaceElevated,borderColor:colors.border}]}>
          <Text style={[s.heading,text]}>Pip’s personality</Text><View style={s.chips}>{chip('Playful',settings.tone==='playful',()=>{change({tone:'playful'});})}{chip('Gentle',settings.tone==='gentle',()=>{change({tone:'gentle'});})}</View>
          <View style={[s.preview,{backgroundColor:colors.background}]}><Text style={[s.label,text]}>{settings.tone==='playful'?'Pip has entered the chat':'A little diary check-in'}</Text>
            <Text style={[s.small,muted]}>{settings.tone==='playful'?'Tiny paws. Big plans. Any meals missing from your diary?':'Your diary is ready whenever you want to check in.'}</Text></View>
          <Text style={[s.label,text]}>Maximum per day</Text><View style={s.chips}>{chip('1 reminder',settings.dailyLimit===1,()=>{change({dailyLimit:1});})}{chip('2 reminders',settings.dailyLimit===2,()=>{change({dailyLimit:2});})}</View>
          <Text style={[s.small,muted]}>At least 3 hours apart. Pip stays quiet while you’re using the app.</Text>
          <Text style={[s.label,text]}>Quiet hours</Text><View style={s.chips}>{chip('9 pm–9 am',settings.quietStart===21&&settings.quietEnd===9,()=>{change({quietStart:21,quietEnd:9});})}
            {chip('8 pm–10 am',settings.quietStart===20&&settings.quietEnd===10,()=>{change({quietStart:20,quietEnd:10});})}
            {chip('9 pm–noon',settings.quietStart===21&&settings.quietEnd===12,()=>{change({quietStart:21,quietEnd:12});})}</View>
          <Text style={[s.small,muted]}>Uses your phone’s local time. Notification timing is managed by iOS or Android.</Text>
        </View>
        <View style={s.chips}>
          {chip(settings.pausedUntil>Date.now()?'Resume reminders':'Pause for 24 hours',settings.pausedUntil>Date.now(),()=>{change({pausedUntil:settings.pausedUntil>Date.now()?0:Date.now()+86400000});})}
          <TouchableOpacity accessibilityRole="button" disabled={testing||busy||!ready||Platform.OS==='web'} style={[s.chip,{borderColor:colors.border}]} onPress={async()=>{
            setTesting(true);try{await sendTestReminder(userId);Alert.alert('Test scheduled','Lock your phone or put Footprint in the background now. Pip will send a test in about 5 seconds.');}
            catch(error){Alert.alert('Test not sent',error instanceof Error?error.message:'Try again.');}finally{setTesting(false);}
          }}><Text style={[s.label,{color:colors.primary}]}>{testing?'Scheduling…':'Send test notification'}</Text></TouchableOpacity>
        </View>
        {busy&&<ActivityIndicator color={colors.primary}/>}
        <Text style={[s.small,muted]}>Reminders update after meal logs, saved sets, recorded walks, and app visits. Future reminders are invitations—not claims about what you did while offline. Your check-in streak counts days with a real logged meal or completed activity.</Text>
      </ScrollView>
    </View>
  </Modal>;
}
const s=StyleSheet.create({header:{flexDirection:'row',alignItems:'center',gap:12,paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},title:{fontFamily:BRAND_ROUNDED_FONT_EXTRA,fontSize:26,fontWeight:'800',marginBottom:5},heading:{fontSize:16,fontWeight:'800'},label:{fontSize:13,fontWeight:'700'},small:{fontSize:12,lineHeight:18},close:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center'},card:{padding:16,borderRadius:18,borderWidth:1,gap:12},option:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:44,paddingHorizontal:13,paddingVertical:12,borderRadius:12,borderWidth:1,justifyContent:'center'},preview:{padding:13,borderRadius:12,gap:5}});
