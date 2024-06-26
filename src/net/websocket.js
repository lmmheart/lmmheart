import { get } from '../net/index.js';
import mitt from 'mitt';
import { useRoomStore } from '../stores/roomInformation.js'
import { ElMessage, ElNotification } from 'element-plus';
// import { Notification } from 'element-ui'

export const bus = mitt();

const room = useRoomStore();

// WebSocket
var ws = null;
// WebSocket连接地址
var ws_url = 'ws://localhost:8084/ws'

// 创建WebSocket
// ws_create(ws_url);

// 创建WebSocket
function ws_create(url) {
    try {
        // 判断是否支持 WebSocket
        if ('WebSocket' in window) {
            // 连接WebSocket
            ws = new WebSocket(url);
            // 初始化WebSocket事件(WebSocket对象, WebSocket连接地址)
            ws_event(ws, url);
        }
    } catch (e) {
        // 重新连接WebSocket
        ws_recontent(url);
        console.log(e);
    }
}

function ws_close() {
    ws.close()
    room.ws_state = false
    ws_heartCheck.reset()
}


// let callBack = () => {};

// WebSocket 事件创建
function ws_event(ws, url) {
    ws.onopen = function (event) {
        // 心跳检测重置
        ws_heartCheck.reset().start();
        console.log("WebSocket已连接");
    };

    ws.onclose = function (event) {
        // 重新连接WebSocket
        ws_recontent(url);
        console.log("WebSocket连接已关闭");
    };

    ws.onerror = function (event) {
        // 重新连接WebSocket
        ws_recontent(url);
        console.log("WebSocket错误：", event);
    };

    ws.onmessage = function (event) {
        // 只要有数据，那就说明连接正常
        ws_heartCheck.reset().start();

        // 处理数据，只处理非心跳检测的数据
        if (event.data != 'Echo message: check') {
            // 处理数据
            let data = JSON.parse(event.data);

            let Cboard = Array(19 * 19).fill(0)
            if (data.mode === 0 || data.mode === 1 || data.mode === 2 || data.mode === 3 || data.mode === 4) {
                let chessboard = data.message.board;

                for (let i = 0; i < 19; i++) {
                    for (let j = 0; j < 19; j++) {
                        if (chessboard[i][j] === -1) Cboard[i * 19 + j] = 0;
                        else if (chessboard[i][j] === 0) Cboard[i * 19 + j] = -1;
                        else if (chessboard[i][j] === 1) Cboard[i * 19 + j] = 1;
                    }
                }

                room.jsonchessboard = JSON.parse(JSON.stringify(Cboard));

            }

            switch (data.mode) {
                case 0://CHESS_WAIT
                    room.chessboard = Cboard;
                    room.playerisblack = !room.playerisblack;
                    if (room.gamestart) {
                        room.selectedmap = Array(19 * 19).fill(false);
                        room.selectedmap[data.message.lastPos[0] * 19 + data.message.lastPos[1]] = true;
                    }
                    // console.log(room.gamestart);
                    //当前方执白
                    if (!room.gamestart) {
                        room.gamestart = true;
                        room.showdialog = false;
                        room.playerisblack = true;
                        room.isnotsurrender = true;
                        room.showdialogend = false;
                        if (room.blackplayer.id === room.userid) {
                            let tmp = room.whiteplayer;
                            room.whiteplayer = room.blackplayer;
                            room.blackplayer = tmp;
                        }
                    }
                    break;
                case 1://CHESS_START

                    room.chessboard = Cboard;
                    room.playerisblack = !room.playerisblack;
                    room.isdrop = true;
                    if (room.gamestart) {
                        room.selectedmap = Array(19 * 19).fill(false);
                        room.selectedmap[data.message.lastPos[0] * 19 + data.message.lastPos[1]] = true;
                    }
                    //当前方执黑
                    if (!room.gamestart) {
                        room.gamestart = true;
                        room.showdialog = false;
                        room.playerisblack = true;
                        room.isnotsurrender = true;
                        room.showdialogend = false;
                        room.selectedmap = Array(19 * 19).fill(false);
                        if (room.whiteplayer.id === room.userid) {
                            let tmp = room.blackplayer;
                            room.blackplayer = room.whiteplayer;
                            room.whiteplayer = tmp;
                        }
                    }
                    break;
                case 2://CHESS_STOP_ONCE
                    room.chessboard = Cboard;
                    break;
                case 3://CHESS_STOP_ONCE_ANOTHER
                    room.chessboard = Cboard;
                    room.playerisblack = !room.playerisblack;
                    room.isdrop = true;
                    ElNotification({ title: '对方选择停一手' })
                    break;
                case 4://CHESS_REQUEST_STOP
                    room.chessboard = Cboard;
                    break;
                case 5://CHESS_END
                    room.showdialogend = true;
                    room.gamestart = false;
                    room.isnotsurrender = false;
                    room.selectedmap = Array(19 * 19).fill(false);
                    if (data.message.mode === 0) {//双方停一手结束对局
                        if (data.message.winner === "black") {
                            room.winner = "获胜方： " + room.blackplayer.name
                        }
                        else if (data.message.winner === "white") {
                            room.winner = "获胜方： " + room.whiteplayer.name
                        }
                        else if (data.message.winner === "equal") {
                            room.winner = "双方平局"
                        }
                        room.whitecount = data.message.white
                        room.blackcount = data.message.black
                        room.isnotsurrender = true;
                    }
                    else if (data.message.mode === 1) {//对方认输结束对局
                        // room.isnotsurrender = false;
                        room.winner = "对方投降，你赢了！"
                    }
                    room.waitforresult = false;
                    break;
                case 6://等待结果
                    room.showdialogend = true;
                    room.waitforresult = true;
                    break;
                case 10://ROOM_ENTER
                    room.roomowner.id = data.message.createUserId
                    room.roomowner.name = data.message.createUserName;
                    room.roomplayer.id = data.message.secondUserId;
                    room.disablestartgame = false;
                    room.gamestart = false;

                    get("/api/user/" + room.roomplayer.id,
                        (message) => { room.roomplayer.name = message.result.username })

                    break;
                case 11://ROOM_EXIT;
                    room.roomplayer.id = "";
                    room.roomplayer.name = "";
                    room.roomowner.id = room.userid;
                    room.roomowner.name = room.username;
                    room.isowner = true;
                    room.showdialog = true;
                    room.disablestartgame = true;
                    room.gamestart = false;
                    break;
            }
            // callBack(roomowner, user2, chessboard);
            //bus.emit("websocket", {roomowner: roomowner, user2: user2, chessboard: chessboard})
        }
    };
}

// function registerCallBack(func) {
//     callBack = func;
// }

// function unregisterCallBack() {
//     callBack = () => {};
// }

// 重新连接websocker(WebSocket连接地址)
function ws_recontent(url) {
    if (room.ws_state) {
        // 延迟避免请求过多
        setTimeout(function () {
            ws_create(url);
        }, 2000);
    }
}

// 监听窗口关闭事件，当窗口关闭时，主动去关闭websocket连接，防止连接还没断开就关闭窗口，这样服务端会抛异常。
window.onbeforeunload = function () {
    ws_close()
}

// WebSocket心跳检测
var ws_heartCheck = {
    timeout: 5000,			// 5秒一次心跳
    timeoutObj: null,		// 执行心跳的定时器
    serverTimeoutObj: null,	// 服务器超时定时器
    reset: function () {		// 重置方法
        clearTimeout(this.timeoutObj);
        clearTimeout(this.serverTimeoutObj);
        return this;
    },
    start: function () {		// 启动方法
        var self = this;
        this.timeoutObj = setTimeout(function () {
            // 这里发送一个心跳信息，后端收到后，返回一个消息，在onmessage拿到返回的心跳（信息）就说明连接正常
            ws.send("check");
            // 如果超过一定时间还没重置，说明后端主动断开了
            self.serverTimeoutObj = setTimeout(function () {
                // 如果onclose会执行reconnect，我们执行ws.close()就行了.如果直接执行reconnect 会触发onclose导致重连两次
                ws.close();
            }, self.timeout);
        }, this.timeout);
    }
}


export {
    ws,
    ws_url,
    ws_create,
    ws_close
}