import { FirstRunTutorial, TutorialTabButton } from '@/components/FirstRunTutorial';
import React, { useEffect } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, ActivityIndicator, Image } from 'react-native';
import { useAuth } from '@/constants/AuthContext';
import { useTheme } from '@/constants/ThemeContext';

export default function TabLayout() {
const { user, profile, isLoading } = useAuth();
const { colors, theme, isDark } = useTheme();

useEffect(() => {
if (!isLoading && !user) {
router.replace('/sign-in');
} else if (!isLoading && user && !profile.hasCompletedSetup) {
router.replace('/onboarding');
}
}, [user, isLoading, profile.hasCompletedSetup]);

if (isLoading) {
return (
<View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
<ActivityIndicator size="large" color={colors.primary} />
</View>
);
}

if (!user || !profile.hasCompletedSetup) return null;
return (
<FirstRunTutorial key={user.id}><Tabs
screenOptions={{
tabBarActiveTintColor: colors.primary,
tabBarInactiveTintColor: colors.textMuted,
headerStyle: {
backgroundColor: colors.background,
shadowColor: 'transparent',
borderBottomWidth: 1,
borderBottomColor: colors.border,
},
headerTintColor: colors.text,
headerTitleStyle: {
fontWeight: '700',
fontSize: 16,
},
        tabBarShowLabel: false,
        tabBarItemStyle: {
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          paddingVertical: 4,
        },
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e7eb',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 76 : 68,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 6,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 6,
        },
      }}>
      <Tabs.Screen
        name="history"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          tabBarButton: props => <TutorialTabButton {...props} tutorialId="workouts" />,
          title: 'Log',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'barbell' : 'barbell-outline'}
              size={26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          tabBarButton: props => <TutorialTabButton {...props} tutorialId="nutrition" />,
          title: 'Calorie Tracker',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={25}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          tabBarButton: props => <TutorialTabButton {...props} tutorialId="map" />,
          title: 'Track',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={27}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          tabBarButton: props => <TutorialTabButton {...props} tutorialId="community" />,
          title: 'Community',
          headerShown: false,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={25}
              color={color}
            />
          ),
        }}
      />

<Tabs.Screen
name="profile"
options={{
tabBarButton: props => <TutorialTabButton {...props} tutorialId="account" />,
title: 'Profile',
headerShown: false,
tabBarIcon: ({ color, focused }) => {
  const iconSize = 28;
  if (profile.avatarUrl) {
    return (
      <View
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconSize / 2,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.primary : '#d1d5db',
          overflow: 'hidden',
          backgroundColor: '#f3f4f6',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri: profile.avatarUrl }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
    );
  }
  return (
    <View
      style={{
        width: iconSize,
        height: iconSize,
        borderRadius: iconSize / 2,
        borderWidth: focused ? 2 : 1,
        borderColor: focused ? colors.primary : '#d1d5db',
        backgroundColor: focused ? `${colors.primary}25` : '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={focused ? 'person' : 'person-outline'}
        size={iconSize - 10}
        color={focused ? colors.primary : color}
      />
    </View>
  );
},
}}
/>
</Tabs></FirstRunTutorial>
);
}
