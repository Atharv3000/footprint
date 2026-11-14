# Header and modal safe-area audit

Custom headers use measured safe-area insets rather than fixed iOS status-bar estimates. The root provider is initialized from the device's window metrics. Sign-in, onboarding, Track, Activity, Log, History, Profile, Community and the legacy Squads route were checked. Calorie Tracker already uses the library's SafeAreaView. Native Stack headers on the remaining utility routes provide their own top inset.

`AppModal` supplies a modal-local SafeAreaProvider and SafeAreaView for full-screen pages, page sheets, and standard overlays. This covers nutrition history, food logging/scanning, macro setup, calorie and country challenges, progress photos, workout sessions, soreness, squad details, notifications and nested dialogs. Existing safe-area padding on those surfaces is removed to avoid doubling it.

The rep/boxing camera remains edge-to-edge: its preview geometry is unchanged, while close buttons and the HUD use measured top/side insets. The friend QR presentation handles its own header insets. Shared draggable bottom sheets also remain edge-to-edge for their backdrop, with a height cap that keeps their headers below the top safe area even when a caller requests a tall card. Insets/window dimensions update for rotation.

Checks: `node scripts/test-safe-area.cjs`, `node scripts/test-safe-area-modal.cjs`, JSX syntax audit, and iOS bundle download. Padding bounds cover status-bar/Island top insets of 20, 47, 59 and 62 points and a rotated viewport. These are automated layout checks; physical-device visual verification is still needed.

Reference: https://docs.expo.dev/versions/v57.0.0/sdk/safe-area-context/
