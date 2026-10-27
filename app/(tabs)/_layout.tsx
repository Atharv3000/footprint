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

if (!user) return null;
return (
<Tabs
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
        },
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 70 : 60,
          paddingBottom: Platform.OS === 'ios' ? 16 : 0,
          paddingTop: 0,
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
          title: 'Log',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'barbell' : 'barbell-outline'}
              size={size || 25}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="nutrition"
        options={{
          title: 'Calorie Tracker',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'restaurant' : 'restaurant-outline'}
              size={size || 24}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Track',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'compass' : 'compass-outline'}
              size={size || 26}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'people' : 'people-outline'}
              size={size || 24}
              color={color}
            />
          ),
        }}
      />

<Tabs.Screen
name="profile"
options={{
title: 'Profile',
headerShown: false,
tabBarIcon: ({ color, size, focused }) => {
  const iconSize = size || 26;
  if (profile.avatarUrl) {
    return (
      <View
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: iconSize / 2,
          borderWidth: focused ? 2 : 1,
          borderColor: focused ? colors.primary : colors.border,
          overflow: 'hidden',
          backgroundColor: colors.surfaceElevated,
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
        borderColor: focused ? colors.primary : colors.border,
        backgroundColor: focused ? `${colors.primary}25` : colors.surfaceElevated,
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
</Tabs>
);
}
