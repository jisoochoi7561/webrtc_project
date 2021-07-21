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
}
// 하나의 감독관 객체
function Director(name,ws) {
    this.name = name;
    this.ws = ws;
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
        stop(sessionId);
        userRegistry.unregister(sessionId);
    });

    ws.on('message', function(_message) {
        
        
        var message = JSON.parse(_message);
        
        
        console.log('Connection ' + sessionId + ' received message ', message);

        switch (message.id) {
       
            case 'directorJoinRoom':
                let director
                let room;
                if (rooms[message.roomName]){
                    room = message.roomName
                    console.log(room.name + "방 입장 완료")
                }
                else{
                    room = new Room()
                    room.name =message.roomName
                    rooms[message.roomName] = room
                    console.log(room.name + "방 생성 완료")
                }
                if (room.directors[message.directorName]){
                    console.log("이미 존재하는 이름입니다.")
                    ws.send(JSON.stringify({
                        id : 'error',
                        message : '이미 존재하는 이름입니다. 다른이름을 선택해 주세요' 
                    }));
                    break;
                }else{
                    director = new Director()
                    director.name = message.directorName
                    director.ws = ws
                }
                room.directors[message.directorName] = director
                console.log("감독관 추가 완료")
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
