/*
 * (C) Copyright 2014 Kurento (http://kurento.org/)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

var path = require('path');
var express = require('express');
var ws = require('ws');
var minimist = require('minimist');
var url = require('url');
var kurento = require('kurento-client');
var fs    = require('fs');
var https = require('https');
const { timingSafeEqual } = require('crypto');



// 방목록용. 이름으로 방들을 구별하자.


var argv = minimist(process.argv.slice(2), {
  default: {
      as_uri: "https://localhost:8443/",
      ws_uri: "ws://localhost:8888/kurento"
  }
});

var options =
{
  key:  fs.readFileSync('keys/server.key'),
  cert: fs.readFileSync('keys/server.crt')
};

var app = express();
var idCounter = 0;
function nextUniqueId() {
    idCounter++;
    return idCounter.toString();
}

//초기 세팅.. 현재 건드릴 필요 없음.








/*
 * Definition of global variables.
 */
// 전역변수
var kurentoClient = null;
var rooms = {}
var studentSessions = {}
var directorSessions = {}



//서버세팅, 웹소켓 생성

var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = https.createServer(options, app).listen(port, function() {
    console.log('노드 앱 서버가 열렸습니다.');
    console.log(url.format(asUrl) + ' 을 브라우저로 여세요');
    console.log('관리자라면 '+url.format(asUrl) + '/admin.html 을 브라우저로 여세요');
});

var wss = new ws.Server({
    server : server,
    path : '/one2one'
});




// 하나의 방 객체.
function Room() {
    this.roomName = "";
    this.directors = {};
    this.students = {};
}
// 하나의 감독관 객체
function Director(name,ws,roomName) {
    this.name = name;
    this.ws = ws;
    this.roomName = roomName
}
// 하나의 학생 객체
function Student(name,ws,roomName) {
    this.name = name;
    this.ws = ws;
    this.roomName = roomName;
}








/*
 * Server startup
 */



wss.on('connection', function(ws) {
    var sessionId = nextUniqueId();
    console.log('Connection received with sessionId ' + sessionId);

    ws.on('error', function(error) {
        console.log('Connection ' + sessionId + ' error');
        stop(sessionId);
    });

    ws.on('close', function() {
        console.log('Connection ' + sessionId + ' closed');
        // stop(sessionId);
        // userRegistry.unregister(sessionId);
    });

    ws.on('message', function(_message) {
        
        
        var message = JSON.parse(_message);
        
        
        console.log('Connection ' + sessionId + ' received message ', message);
        let director;
        let room;
        let roomName;
        switch (message.id) {
       
            case 'directorJoinRoom':
                if (directorSessions[sessionId]){
                    console.log("한 세션에서 두개의 director로그인시도. 차단합니다.")
                    ws.send(JSON.stringify({
                        id : 'error',
                        message : '한 세션에서 두개의 director로그인시도. 차단합니다. 재접속을 권장합니다.' + message
                    }));
                    break;
                }
                if (rooms[message.roomName]){
                    room = rooms[message.roomName]
                    console.log(rooms[message.roomName].name + "방 입장 완료")
                }
                else{
                    room = new Room()
                    room.name =message.roomName
                    rooms[message.roomName] = room
                    console.log(room.name + "방 생성 완료")
                }
                if (room.directors[message.directorName]){
                    console.log("이미 존재하는 감독관이름입니다.")
                    ws.send(JSON.stringify({
                        id : 'sameNameError',
                        message : '이미 존재하는 감독관이름입니다. 다른이름을 선택해 주세요' 
                    }));
                    break;
                }else{
                    director = new Director(message.directorName,ws,message.roomName)
                }
                room.directors[message.directorName] = director
                directorSessions[sessionId] = director
                console.log("감독관 추가 완료")
            break;




            case 'studentTryCall':
                if (studentSessions[sessionId]){
                    console.log("한 세션에서 두개의 student 로그인시도. 차단합니다.")
                    ws.send(JSON.stringify({
                        id : 'error',
                        message : '한 세션에서 두개의 student 로그인시도. 차단합니다. 재접속을 권장합니다.' + message
                    }));
                    break;
                }
                roomName = message.roomName
                if (!rooms[roomName]){
                    console.log("학생이 존재하지 않는 방에 접근중입니다.")
                    ws.send(JSON.stringify({
                        id : 'roomExistence',
                        value: 'false',
                        message : message.studentName + '님, 존재하지 않는 방입니다.확인해주세요.' 
                    }));
                }
                else{
                    if (rooms[roomName].students[message.studentName]){
                        console.log("이미 존재하는 학생이름입니다.")
                        ws.send(JSON.stringify({
                            id : 'sameNameError',
                            message : '이미 존재하는 학생이름입니다. 다른이름을 선택해 주세요' 
                        }));
                        break;
                    }else{
                        student = new Student(message.studentName,ws,message.roomName)
                    }
                    rooms[roomName].students[message.studentName] = student
                    studentSessions[sessionId] = student
                    console.log("학생 추가 완료")
                    ws.send(JSON.stringify({
                        id : 'roomExistence',
                        value: 'true',
                        message : roomName + '존재하는 방이고 새로운 student 입니다. 유저정보를 세팅해두겠습니다. 연결해주세요.' 
                    }));
                }
                break;


        default:
            ws.send(JSON.stringify({
                id : 'error',
                message : '이런 메시지는 서버가 처리할 수 없습니다.뭔가 잘못된 것 같네요. ' + message
            }));
            break;
        }

    });
});








// 쿠렌토클라이언트 획득. 이건 완성된 함수임.
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    kurento(argv.ws_uri, function(error, _kurentoClient) {
        if (error) {
            var message = 'Coult not find media server at address ' + argv.ws_uri;
            return callback(message + ". Exiting with error " + error);
        }

        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}




app.use(express.static(path.join(__dirname, 'static')));
