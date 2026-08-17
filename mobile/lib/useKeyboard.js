// Bottom spacing for screens with a composer pinned to the bottom of the screen.
//
// Expo SDK 57 / RN 0.86 force edge-to-edge on Android and it can no longer be
// turned off, so the app window does NOT shrink when the IME opens. That is what
// breaks <KeyboardAvoidingView> here: behavior={undefined} does nothing at all and
// behavior="height" squashes the whole screen instead of lifting the bar. Keyboard
// events still fire — RN derives them from WindowInsets rather than from a window
// resize — so we read the height off the event and pad the composer ourselves.
//
// One platform quirk decides the maths: on Android RN reports the IME height with
// the navigation bar already subtracted (ReactRootView.checkForKeyboardEvents does
// `imeInsets.bottom - systemBars.bottom`) while our composers are laid out down to
// the physical bottom of the screen, so that inset has to be added back. iOS
// reports the full keyboard frame, home indicator included, and needs no fixing up.

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IDLE_GAP = 8; // same idle floor BottomNav uses

export function useKeyboard() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // keyboardWill* is iOS only — Android only ever emits keyboardDid*.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setHeight(e?.endCoordinates?.height || 0));
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const visible = height > 0;
  const lift = visible ? height + (Platform.OS === 'android' ? insets.bottom : 0) : 0;

  return {
    visible,
    lift,                                                     // space the keyboard alone needs
    inset: visible ? lift : Math.max(insets.bottom, IDLE_GAP), // total space below the composer
  };
}

/* Bottom padding for a composer that owns the bottom strip of the screen. */
export function useKeyboardInset() {
  return useKeyboard().inset;
}
