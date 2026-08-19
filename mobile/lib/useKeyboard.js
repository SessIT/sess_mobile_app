// Bottom spacing for screens with a composer pinned to the bottom of the screen.
//
// The hard part is that Android phones disagree about what happens when the IME
// opens. Some resize the app window so the React tree is already laid out above
// the keyboard; others leave the window at full height and simply draw the
// keyboard over the top. Same Expo build, same OS version — it varies by device
// and OEM keyboard. Assuming either behaviour breaks the other phone: assume a
// resize and the composer hides behind the keyboard, assume none and it gets
// lifted twice and lands halfway up the screen.
//
// So do not assume — measure. The screen hands us its root height via onLayout;
// we remember that height while the keyboard is closed, and when it opens we
// compare. Whatever the window already took off the bottom is `shrunk`, and the
// composer only needs the remainder:
//
//     lift = keyboardHeight (+ Android nav bar) - shrunk        [never below 0]
//
// Resizing phone   -> shrunk covers it all -> lift 0.
// Non-resizing one -> shrunk is 0          -> lift is the whole keyboard.
// Anything between falls out correctly too.
//
// The Android nav-bar term is there because RN reports the IME height with the
// bars already subtracted (ReactRootView.checkForKeyboardEvents does
// `imeInsets.bottom - systemBars.bottom`) while an unresized window lays the
// composer out to the physical bottom of the screen. iOS reports the full
// keyboard frame, home indicator included, and needs no fixing up.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const IDLE_GAP = 8; // same idle floor BottomNav uses

export function useKeyboard() {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [viewH, setViewH] = useState(null);
  const baseH = useRef(null); // root height with the keyboard closed

  useEffect(() => {
    // keyboardWill* is iOS only — Android only ever emits keyboardDid*.
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, (e) => setHeight(e?.endCoordinates?.height || 0));
    const onHide = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const visible = height > 0;

  // Only trust a measurement taken while the keyboard is down as the baseline;
  // rotation and split-screen change it, so keep taking the latest one.
  //
  // The wait is what makes that true. On a resizing Android window the shrunk
  // layout lands BEFORE keyboardDidShow, so `visible` is still false when it
  // arrives and a straight write would record the shrunk height as the
  // baseline. From then on `shrunk` reads 0 and the composer is lifted a second
  // time by the full keyboard — a keyboard-sized hole under the sheet. Deferring
  // gives the show event time to arrive: it flips `visible`, the cleanup below
  // cancels the pending write, and the real baseline survives. A layout with no
  // keyboard behind it (rotation, split-screen) has nothing to cancel it and is
  // recorded a frame or two later, as before.
  useEffect(() => {
    if (visible || viewH == null) return undefined;
    const t = setTimeout(() => { baseH.current = viewH; }, 120);
    return () => clearTimeout(t);
  }, [visible, viewH]);

  /* Attach to the screen's root <View style={{ flex: 1 }}> — without it we
   * cannot tell the two Android behaviours apart and fall back to lifting by
   * the full keyboard, which is the safe half of the guess (visible but high)
   * rather than the unsafe one (hidden behind the keyboard). */
  const onLayout = useCallback((e) => setViewH(e.nativeEvent.layout.height), []);

  const shrunk = visible && baseH.current != null && viewH != null
    ? Math.max(0, baseH.current - viewH)
    : 0;

  const needed = height + (Platform.OS === 'android' ? insets.bottom : 0);
  const lift = visible ? Math.max(0, needed - shrunk) : 0;

  return {
    visible,
    onLayout,
    lift,                                            // extra space the keyboard still needs
    // Total space below the composer. Never collapses to nothing, so the bar
    // keeps its breathing room when it is resting straight on the keyboard.
    inset: visible ? Math.max(lift, IDLE_GAP) : Math.max(insets.bottom, IDLE_GAP),
  };
}

/* Bottom padding for a composer that owns the bottom strip of the screen. */
export function useKeyboardInset() {
  return useKeyboard().inset;
}
