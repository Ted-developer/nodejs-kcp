using System;
using UnityEngine;

namespace WBFramework {
    public static class Debugger {
        public static bool Enable = true;
        public static Action Callback = null;
        public static void Log (string format, params object[] args) {
            if (!Enable)
                return;
            var str = "[Net] " + String.Format (format, args);
            Debug.Log (str);
            Callback?.Invoke ();
        }
    }
}