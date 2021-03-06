using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using XLua;

namespace WBFramework {
    [LuaCallCSharp]
    public class SocketEvent {
        public Action callback;
        public SocketEvent () { }
        public SocketEvent (string msg) {
            this.Msg = msg;
        }

        public string Tag { get; set; }

        public string Msg { get; set; }

        public byte[] Data { get; set; }
    };

    public enum MessageDataFormat : byte {
        Json = 0x01,
        Pb = 0x02,
    }

    namespace Sockets {
        [LuaCallCSharp]
        public class Socket {
            private readonly ConcurrentDictionary<string, Action<SocketEvent>> _eventHandlers = new ConcurrentDictionary<string, Action<SocketEvent>> ();

            private SocketTask _socketTask;

            private int _status;
            private readonly bool _enableUdp;

            // private Action<byte[], int> emit;

            public string Url { get; set; }

            public ConcurrentDictionary<string, Action<SocketEvent>> EventOnceHandlers { get; } = new ConcurrentDictionary<string, Action<SocketEvent>> ();

            public int Id { get; }

            public bool IsMsgBind { get; set; } = false;

            public bool ForceClose { get; set; } = false;

            public readonly Timer ReconnectTimer  = new Timer ();

            public int ReconnectTimes { get; set; }

            public Action<byte[], int> Handler { get; set; }

            public Socket (int id, bool enableUdp, string url) {
                this.Id = id;
                this.Url = url;
                this._enableUdp = enableUdp;
                ReconnectTimes = 0;
            }

            private void OpenSocketTask (string tag) {
                if (string.IsNullOrEmpty (this.Url)) throw new Exception ("Socket.url = " + this.Url);
                if (!IsSocketStatus ("connect") && !IsSocketStatus ("close")) {
                    ReconnectTimer.SetTimer (() => OpenSocketTask ("open"), Config.ReconnectInterval);
                }
                if (!IsSocketStatus ("close")) return;

                ReconnectTimes++;
                // ????????????????????????????????????????????????
                if (ReconnectTimes > Config.ReconnectMaxTimes) {
                    ReconnectTimes = 0;
                    Debugger.Log ("SOCKET_RECONNECT_TIMEOUT");
                    ReconnectTimer.Stop ();
                    return;
                }

                ReconnectTimer.Stop ();
                ForceClose = false;

                // Debugger.Log ("socket enable: {0}", _enableUdp && Config.EnableUdp);
                if (_enableUdp && Config.EnableUdp) {
                    this._socketTask = new KcpSocket (Url, _enableUdp);
                } else {
                    this._socketTask = new CommSocket (Url);
                }

                this._socketTask.onOpen = HandleSocketOpen;
                this._socketTask.onClose = HandleSocketClose;
                this._socketTask.onError = HandleSocketError;
                this._socketTask.onMessage = HandleSocketMessage;

                this._socketTask.Connect ();
            }

            public void ConnectSocketTask (string tag) {
                if (!IsSocketStatus ("connect") && ReconnectTimes > 0 && ReconnectTimes < Config.ReconnectMaxTimes) {
                    // ????????????
                    return;
                }
                ReconnectTimes = 0;
                OpenSocketTask (tag + " connect");
            }

            public void ConnectNewSocketTask (string url) {
                // ?????? socketTask????????? connect ????????????????????? socketTask
                this.Url = url;
                ReconnectTimes = 0;

                void NewConnect () {
                    ConnectSocketTask ("connectNewSocket");
                }

                CloseSocketTask (NewConnect, NewConnect);
            }

            /////////////////////////////////   ???????????????   //////////////////////////////////
            public void CloseSocketTask (Action success, Action fail) {
                // ??????
                this.ForceClose = true;
                if (_socketTask == null) {
                    success?.Invoke ();
                    EmitCloseStatus ();
                    return;
                }

                this._socketTask.Close (
                    // Success Action
                    () => {
                        this._socketTask = null;
                        success?.Invoke ();
                    },
                    // Fail Action
                    () => {
                        this._socketTask = null;
                        fail?.Invoke ();
                    }
                );
            }
            public void DestroySocketTask () {
                ReconnectTimer.Stop ();
                if (!IsSocketStatus ("close")) {
                    CloseSocketTask (null, null);
                }
                _eventHandlers.Clear ();
                IsMsgBind = false;
            }

            private void HandleSocketOpen () {
                ReconnectTimes = 0;
                EmitConnectStatus ();
                ReconnectTimer.Stop ();
            }

            private void HandleSocketClose () {
                EmitCloseStatus ();

                ReconnectTimer.SetTimer(() => OpenSocketTask("close"), Config.ReconnectInterval);

                if (!this.ForceClose) return;
                ReconnectTimes = 0;
                this.ForceClose = false;
                // forceClose?????????timer??????????????????
                ReconnectTimer.Stop ();
            }
            private void HandleSocketMessage (SocketEvent e) {
                var eve = new SocketEvent {
                    Msg = "socket message",
                    Data = e.Data
                };
                Emit ("message", eve);
            }
            private void HandleSocketError (SocketEvent errMsg) {
                // var eve = new SocketEvent {
                //     Msg = "socket connectError",
                //     Data = errMsg.Data
                // };
                Emit ("connectError", errMsg);
                ReconnectTimer.SetTimer(() => OpenSocketTask("error"), Config.ReconnectInterval);

            }

            private void OnTimedOpen (object source, System.Timers.ElapsedEventArgs e) {
                OpenSocketTask ("close");
            }

            public void OnEvent (string tag, Action<SocketEvent> socketEvent) {
                this._eventHandlers.TryAdd (tag, socketEvent);
                if (tag == "message") {
                    this.IsMsgBind = true;
                };
            }

            // Once Event Listener: Remove listener when event executed 
            public void OnceEvent (string tag, Action<SocketEvent> socketEvent) {
                this.EventOnceHandlers.TryAdd (tag, socketEvent);
            }

            ///////////////////////////////     ????????????     //////////////////////////////////
            public bool IsSocketStatus (string status) {
                switch (status) {
                    case "connect":
                        if (_socketTask == null || _socketTask.ReadyState != SocketTask.Open)
                            break;
                        return true;
                    case "connecting":
                        if (_socketTask == null || _socketTask.ReadyState != SocketTask.Connecting)
                            break;
                        return true;
                    case "close":
                        if (_socketTask == null) return true;
                        if (_socketTask != null && _socketTask.ReadyState != SocketTask.Closed)
                            break;
                        return true;
                    case "closing":
                        if (_socketTask == null || _socketTask.ReadyState != SocketTask.Closing)
                            break;
                        return true;
                }
                return false;
            }

            public void Emit (string tag, SocketEvent socketEvent) {
                if (socketEvent != null) socketEvent.Tag = tag;
                foreach (var key in _eventHandlers.Keys.Where (key => key.Equals (tag) || key.Equals ("*"))) {
                    _eventHandlers[key].Invoke (socketEvent);
                };

                foreach (var key in EventOnceHandlers.Keys.Where (key => key.Equals (tag))) {
                    _eventHandlers[key].Invoke (socketEvent);
                    Action<SocketEvent> eve;
                    EventOnceHandlers.TryRemove (tag, out eve);
                };
            }
            private static void Reconnect () {

            }

            private void EmitConnectStatus () {
                Emit ("connect", new SocketEvent ("socket is connected"));
            }

            private void EmitCloseStatus () {
                Emit ("connectClose", new SocketEvent ("socket is closed"));
            }

            ///////////////////////////////// ???????????????????????? //////////////////////////////////
            public void Send (byte[] data, Action<int> sendFail, Action sendSuccess) {
                if (!IsSocketStatus ("connect")) {
                    sendFail (-1);
                    Reconnect ();
                    return;
                }

                _socketTask.Send (data, sendFail, sendSuccess);
            }
        }
    }
}