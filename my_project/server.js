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

var path = require("path");
var express = require("express");
var ws = require("ws");
var minimist = require("minimist");
var url = require("url");
var kurento = require("kurento-client");
var fs = require("fs");
var http = require("http");

// 방목록용. 이름으로 방들을 구별하자.

var argv = minimist(process.argv.slice(2), {
  default: {
    as_uri: "http://localhost:8443",
    ws_uri: "ws://localhost:8888/kurento",
  },
});

//var options =
//{
//  cert:  fs.readFileSync('/etc/letsencrypt/live/jisoochoi.shop/fullchain.pem'),
//  key: fs.readFileSync('/etc/letsencrypt/live/jisoochoi.shop/privkey.pem')
//};

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
var rooms = {};
var sessions = {};

//서버세팅, 웹소켓 생성

var asUrl = url.parse(argv.as_uri);
var port = asUrl.port;
var server = http.createServer(app).listen(port, function () {
  console.log("노드 앱 서버가 열렸습니다.");
  console.log(url.format(asUrl) + " 을 브라우저로 여세요");
  console.log(
    "관리자라면 " + url.format(asUrl) + "/admin.html 을 브라우저로 여세요"
  );
});

var wss = new ws.Server({
  server: server,
  path: "/websocket",
});

// 하나의 방 객체.
function Room() {
  this.name = "";
  this.directors = {};
  this.students = {};
  this.cams = {};
}
// 하나의 감독관 객체
function Director(name, ws, roomName) {
  this.name = name;
  this.ws = ws;
  this.roomName = roomName;
  this.endpointPerStudent = {};
  this.endpointPerCam = {};
}
// 하나의 학생 객체
function Student(name, ws, roomName) {
  this.name = name;
  this.ws = ws;
  this.roomName = roomName;
  this.candidatesQueue = null;
}
function Cam(name, ws, roomName) {
  this.name = name;
  this.ws = ws;
  this.roomName = roomName;
  this.candidatesQueue = null;
}

// 쿠렌토클라이언트 획득. 이건 완성된 함수임.
function getKurentoClient(callback) {
  console.log("쿠렌토 클라이언트 획득을 시도합니다.");
  if (kurentoClient !== null) {
    return callback(null, kurentoClient);
  }

  kurento(argv.ws_uri, function (error, _kurentoClient) {
    console.log("쿠렌토 서버 연결중~~.");
    if (error) {
      var message = "Coult not find media server at address " + argv.ws_uri;
      return callback(message + ". Exiting with error " + error);
    }

    kurentoClient = _kurentoClient;
    console.log("쿠렌토 클라이언트 획득성공.");
    callback(null, kurentoClient);
  });
}

//학생,감독관이 자신의 웹소켓을 통해 메시지를 보내는 함수
Student.prototype.sendMessage = function (message) {
  this.ws.send(JSON.stringify(message));
};

Director.prototype.sendMessage = function (message) {
  this.ws.send(JSON.stringify(message));
};
Cam.prototype.sendMessage = function (message) {
  this.ws.send(JSON.stringify(message));
};

//학생이 파이프라인을 만들어서 자신에게 pipeline과 webrtcendpoint를 등록해둔다.
//그리고 저 webrtcendpoint를 자기와 연결해야한다...이걸 콜백부분에...
//그리고 방에 있는 모든 시험관들에게 연결을 형성하고 허브에 연결하라고 해야한다.이걸 콜백부분에...
//여기있는 콜백은,파이프라인을 만든 이후에 할 함수.
Student.prototype.createPipeline = function (callerId, roomName, ws, callback) {
  try {
    console.log("파이프라인 생성 시도합니다");
    var self = this;
    studentName = sessions[callerId].name;
    // 쿠렌토클라이언트에 접근
    getKurentoClient(function (error, kurentoClient) {
      try {
        if (error) {
          self.sendMessage({ id: "shouldStop" });
          return console.log("쿠렌토클라이언트 생성중 오류");
        }
        //파이프라인을 하나 만든다
        kurentoClient.create("MediaPipeline", function (error, pipeline) {
          try {
            if (error) {
              self.sendMessage({ id: "shouldStop" });
              return console.log("파이프라인 생성중 오류");
            }
            //쿠렌토측에 webrtcendpoint를 만든다.
            console.log("WebRtcEndpoint생성하겠습니다 ");
            pipeline.create(
              "WebRtcEndpoint",
              function (error, studentWebRtcEndpoint) {
                try {
                  if (error) {
                    self.sendMessage({ id: "shouldStop" });
                    pipeline.release();
                    return console.log("엔드포인트 생성중 오류");
                  }
                  //저장해둔 candidate가 있으면 추가한다
                  console.log("저장해둔 candidates가 있으면 추가합니다. ");
                  if (sessions[callerId].candidatesQueue) {
                    console.log("저장된 candidates를 추가합니다. ");
                    while (sessions[callerId].candidatesQueue.length) {
                      var candidate =
                        sessions[callerId].candidatesQueue.shift();
                      studentWebRtcEndpoint.addIceCandidate(candidate);
                    }
                  }
                  //onicecandidate함수를 설정한다
                  console.log(
                    "쿠렌토측 endpoint의 onicecandiate설정하겠습니다. "
                  );
                  studentWebRtcEndpoint.on("OnIceCandidate", function (event) {
                    var candidate = kurento.getComplexType("IceCandidate")(
                      event.candidate
                    );
                    self.ws.send(
                      JSON.stringify({
                        id: "iceCandidate",
                        candidate: candidate,
                      })
                    );
                  });

                  console.log("디스패처만 만들면 됩니다..");

                  //디스패처를 만든다.
                  pipeline.create(
                    "DispatcherOneToMany",
                    function (error, dispatcher) {
                      try {
                        if (error) {
                          self.sendMessage({ id: "shouldStop" });
                          pipeline.release();
                          return console.log("디스패처 생성 실패...");
                        }

                        //디스패처의 소스에 자기자신을 등록, 자기자신의 디스패처,파이프라인.웹rtc기억.
                        dispatcher.createHubPort(function (error, hubport) {
                          try {
                            if (error) {
                              self.sendMessage({ id: "shouldStop" });
                              pipeline.release();
                              return console.log("createHubPort 에러 발생");
                            }
                            dispatcher.setSource(hubport);
                            studentWebRtcEndpoint.connect(hubport);
                            hubport.connect(studentWebRtcEndpoint);
                            //학생객체에 저장.
                            self.dispatcher = dispatcher;
                            self.pipeline = pipeline;
                            self.webRtcEndpoint = studentWebRtcEndpoint;
                            if (sessions[callerId].candidatesQueue) {
                              console.log("저장된 candidates를 추가합니다. ");
                              while (
                                sessions[callerId].candidatesQueue.length
                              ) {
                                var candidate =
                                  sessions[callerId].candidatesQueue.shift();
                                studentWebRtcEndpoint.addIceCandidate(
                                  candidate
                                );
                              }
                            }
                            //감독관들에게 연결 형성 요구 메시지 날린다
                            console.log("현재 접속 시도하는 방 : " + roomName);
                            for (let key in rooms[roomName].directors) {
                              rooms[roomName].directors[key].endpointPerStudent[
                                sessions[callerId].name
                              ] = {};

                              message = {
                                id: "shouldConnect",
                                studentName: sessions[callerId].name,
                                roomName:
                                  rooms[roomName].directors[key].roomName,
                                message:
                                  "학생 " +
                                  sessions[callerId].name +
                                  "이 연결요청을 하고 있습니다.",
                              };
                              rooms[roomName].directors[key].sendMessage(
                                message
                              );
                              console.log(
                                "현재 존재하는 감독관: " +
                                  key +
                                  "들에게 연결요청을 보내겠습니다."
                              );
                            }
                            //임시로 자기자신에게 연결해두었음.
                            // console.log("임시로 자기자신에게 연결합니다")
                            // dispatcher.createHubPort(function(error,outputHubport) {
                            //     if (error) {
                            //         self.sendMessage({id:"shouldStop"});
                            //         pipeline.release();
                            //         return console.log("createHubPort 에러 발생")
                            //     }
                            //     outputHubport.connect(studentWebRtcEndpoint)

                            // });

                            //저장소 설정
                            dispatcher.createHubPort(function (
                              error,
                              recordport
                            ) {
                              try {
                                file_uri =
                                  "file:///tmp/" +
                                  roomName +
                                  "_" +
                                  studentName +
                                  "_" +
                                  new Date().toString() +
                                  ".webm";
                                var elements = [
                                  {
                                    type: "RecorderEndpoint",
                                    params: {
                                      uri: file_uri,
                                      mediaProfile: "WEBM_VIDEO_ONLY",
                                    },
                                  },
                                ];
                                pipeline.create(
                                  elements,
                                  function (error, elements) {
                                    if (error) return console.log(error);

                                    var recorder = elements[0];
                                    self.recorder = recorder;
                                    recordport.connect(recorder);
                                    recorder.record(function (error) {
                                      if (error) return console.log(error);

                                      console.log("record");
                                    });
                                  }
                                );
                              } catch (e) {
                                throw e;
                              }
                            });

                            callback(null);
                          } catch (e) {
                            throw e;
                          }
                        });
                      } catch (e) {
                        throw e;
                      }
                    }
                  );
                } catch (e) {
                  throw e;
                }
              }
            );
          } catch (e) {
            throw e;
          }
        });
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
};

//학생이 파이프라인을 만들어서 자신에게 pipeline과 webrtcendpoint를 등록해둔다.
//그리고 저 webrtcendpoint를 자기와 연결해야한다...이걸 콜백부분에...
//그리고 방에 있는 모든 시험관들에게 연결을 형성하고 허브에 연결하라고 해야한다.이걸 콜백부분에...
//여기있는 콜백은,파이프라인을 만든 이후에 할 함수.
Cam.prototype.createPipeline = function (callerId, roomName, ws, callback) {
  try {
    console.log("파이프라인 생성 시도합니다");
    var self = this;
    camName = sessions[callerId].name;
    // 쿠렌토클라이언트에 접근
    getKurentoClient(function (error, kurentoClient) {
      try {
        if (error) {
          self.sendMessage({ id: "shouldStop" });
          return console.log("쿠렌토클라이언트 생성중 오류");
        }
        //파이프라인을 하나 만든다
        kurentoClient.create("MediaPipeline", function (error, pipeline) {
          try {
            if (error) {
              self.sendMessage({ id: "shouldStop" });
              return console.log("파이프라인 생성중 오류");
            }
            //쿠렌토측에 webrtcendpoint를 만든다.
            console.log("WebRtcEndpoint생성하겠습니다 ");
            pipeline.create(
              "WebRtcEndpoint",
              function (error, camWebRtcEndpoint) {
                try {
                  if (error) {
                    self.sendMessage({ id: "shouldStop" });
                    pipeline.release();
                    return console.log("엔드포인트 생성중 오류");
                  }
                  //저장해둔 candidate가 있으면 추가한다
                  console.log("저장해둔 candidates가 있으면 추가합니다. ");
                  if (sessions[callerId].candidatesQueue) {
                    console.log("저장된 candidates를 추가합니다. ");
                    while (sessions[callerId].candidatesQueue.length) {
                      var candidate =
                        sessions[callerId].candidatesQueue.shift();
                      camWebRtcEndpoint.addIceCandidate(candidate);
                    }
                  }
                  //onicecandidate함수를 설정한다
                  console.log(
                    "쿠렌토측 endpoint의 onicecandiate설정하겠습니다. "
                  );
                  camWebRtcEndpoint.on("OnIceCandidate", function (event) {
                    var candidate = kurento.getComplexType("IceCandidate")(
                      event.candidate
                    );
                    self.ws.send(
                      JSON.stringify({
                        id: "iceCandidate",
                        candidate: candidate,
                      })
                    );
                  });

                  console.log("디스패처만 만들면 됩니다..");

                  //디스패처를 만든다.
                  pipeline.create(
                    "DispatcherOneToMany",
                    function (error, dispatcher) {
                      try {
                        if (error) {
                          self.sendMessage({ id: "shouldStop" });
                          pipeline.release();
                          return console.log("디스패처 생성 실패...");
                        }

                        //디스패처의 소스에 자기자신을 등록, 자기자신의 디스패처,파이프라인.웹rtc기억.
                        dispatcher.createHubPort(function (error, hubport) {
                          try {
                            if (error) {
                              self.sendMessage({ id: "shouldStop" });
                              pipeline.release();
                              return console.log("createHubPort 에러 발생");
                            }
                            dispatcher.setSource(hubport);
                            camWebRtcEndpoint.connect(hubport);
                            hubport.connect(camWebRtcEndpoint);
                            //학생객체에 저장.
                            self.dispatcher = dispatcher;
                            self.pipeline = pipeline;
                            self.webRtcEndpoint = camWebRtcEndpoint;
                            console.log(
                              "저장해둔 candidates가 있으면 추가합니다. "
                            );
                            if (sessions[callerId].candidatesQueue) {
                              console.log("저장된 candidates를 추가합니다. ");
                              while (
                                sessions[callerId].candidatesQueue.length
                              ) {
                                var candidate =
                                  sessions[callerId].candidatesQueue.shift();
                                camWebRtcEndpoint.addIceCandidate(candidate);
                              }
                            }
                            //감독관들에게 연결 형성 요구 메시지 날린다
                            console.log("현재 접속 시도하는 방 : " + roomName);
                            for (let key in rooms[roomName].directors) {
                              rooms[roomName].directors[key].endpointPerCam[
                                sessions[callerId].name
                              ] = {};
                              message = {
                                id: "camShouldConnect",
                                camName: sessions[callerId].name,
                                roomName:
                                  rooms[roomName].directors[key].roomName,
                                message:
                                  "cam " +
                                  sessions[callerId].name +
                                  "이 연결요청을 하고 있습니다.",
                              };
                              rooms[roomName].directors[key].sendMessage(
                                message
                              );
                              console.log(
                                "현재 존재하는 감독관: " +
                                  key +
                                  "들에게 연결요청을 보내겠습니다."
                              );
                            }
                            //임시로 자기자신에게 연결해두었음.
                            // console.log("임시로 자기자신에게 연결합니다")
                            // dispatcher.createHubPort(function(error,outputHubport) {
                            //     if (error) {
                            //         self.sendMessage({id:"shouldStop"});
                            //         pipeline.release();
                            //         return console.log("createHubPort 에러 발생")
                            //     }
                            //     outputHubport.connect(camWebRtcEndpoint)

                            // });
                            dispatcher.createHubPort(function (
                              error,
                              recordport
                            ) {
                              try {
                                file_uri =
                                  "file:///tmp/" +
                                  roomName +
                                  "_" +
                                  camName +
                                  "_" +
                                  "cam_" +
                                  new Date().toString() +
                                  ".webm";
                                var elements = [
                                  {
                                    type: "RecorderEndpoint",
                                    params: {
                                      uri: file_uri,
                                      mediaProfile: "WEBM_VIDEO_ONLY",
                                    },
                                  },
                                ];
                                pipeline.create(
                                  elements,
                                  function (error, elements) {
                                    if (error) return console.log(error);

                                    var recorder = elements[0];
                                    self.recorder = recorder;
                                    recordport.connect(recorder);
                                    recorder.record(function (error) {
                                      if (error) return console.log(error);

                                      console.log("record");
                                    });
                                  }
                                );
                              } catch (e) {
                                throw e;
                              }
                            });

                            callback(null);
                          } catch (e) {
                            throw e;
                          }
                        });
                      } catch (e) {
                        throw e;
                      }
                    }
                  );
                } catch (e) {
                  throw e;
                }
              }
            );
          } catch (e) {
            throw e;
          }
        });
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
};

/*
 * Server startup
 */

wss.on("connection", function (ws) {
  var sessionId = nextUniqueId();
  console.log("Connection received with sessionId " + sessionId);
  ws.send(
    JSON.stringify({
      id: "roomsKeys",
      message: Object.keys(rooms),
    })
  );
  ws.on("error", function (error) {
    console.log("Connection " + sessionId + " error");
    stop(sessionId);
  });

  ws.on("close", function () {
    console.log("Connection " + sessionId + " closed");
    stop(sessionId);
  });

  ws.on("message", function (_message) {
    var message = JSON.parse(_message);
    console.log("Connection " + sessionId + " received message ", message);
    let director;
    let room;
    let roomName;
    let student;
    let cam;
    switch (message.id) {
      case "directorJoinRoom":
        try {
          if (sessions[sessionId]) {
            console.log("한 세션에서 두개의 director로그인시도. 차단합니다.");
            ws.send(
              JSON.stringify({
                id: "sessionError",
                message:
                  "한 세션에서 두개의 director로그인시도. 차단합니다. 재접속을 권장합니다.",
              })
            );
            break;
          }

          if (message.password != "cnu1234") {
            console.log("잘못된패스워드");
            ws.send(
              JSON.stringify({
                id: "passwordError",
                message: "패스워드 오류",
              })
            );
            break;
          }

          if (rooms[message.roomName]) {
            room = rooms[message.roomName];
            console.log(rooms[message.roomName].name + "방 입장 완료");
          } else {
            room = new Room();
            room.name = message.roomName;
            rooms[message.roomName] = room;
            console.log(room.name + "방 생성 완료");
          }

          if (room.directors[message.directorName]) {
            console.log("이미 존재하는 감독관이름입니다.");
            ws.send(
              JSON.stringify({
                id: "sameNameError",
                message:
                  "이미 존재하는 감독관이름입니다. 다른이름을 선택해 주세요",
              })
            );
            break;
          } else {
            director = new Director(message.directorName, ws, message.roomName);
          }
          room.directors[message.directorName] = director;
          sessions[sessionId] = director;
          console.log("감독관 추가 완료");
          //감독관 추가 완료

          //방정보 송출
          // sendRoomToAll(room)

          students = room.students;
          cams = room.cams;
          for (let key in students) {
            student = students[key];
            director.endpointPerStudent[student.name] = {};
            if (student.dispatcher) {
              message = {
                id: "shouldConnect",
                studentName: student.name,
                roomName: room.name,
                message:
                  "학생 " + student.name + "이 연결요청을 하고 있습니다.",
              };
              director.sendMessage(message);
            } else {
              console.log("접속은 했으나 아직 공유를 안한 학생은 넘어갑니다.");
            }
          }
          for (let key in cams) {
            cam = cams[key];
            director.endpointPerCam[cam.name] = {};

            if (cam.dispatcher) {
              message = {
                id: "camShouldConnect",
                camName: cam.name,
                roomName: room.name,
                message: "cam " + cam.name + "이 연결요청을 하고 있습니다.",
              };
              director.sendMessage(message);
            } else {
              console.log("접속은 했으나 아직 공유를 안한 학생은 넘어갑니다.");
            }
          }
        } catch (error) {
          stop(sessionId);
        } finally {
          break;
        }

      case "studentTryCall":
        try {
          // if (sessions[sessionId]){
          //     console.log("한 세션에서 두개의 student 로그인시도. 차단합니다.")
          //     ws.send(JSON.stringify({
          //         id : 'sessionError',
          //         message : '한 세션에서 두개의 student 로그인시도. 차단합니다. 재접속을 권장합니다.' + message
          //     }));
          //     break;
          // }
          roomName = message.roomName;
          if (!rooms[roomName]) {
            console.log("학생이 존재하지 않는 방에 접근중입니다.");
            ws.send(
              JSON.stringify({
                id: "roomExistence",
                value: "false",
                message:
                  message.studentName +
                  "님, 존재하지 않는 방입니다.확인해주세요.",
              })
            );
          } else {
            if (rooms[roomName].students[message.studentName]) {
              console.log("이미 존재하는 학생이름입니다.");
              ws.send(
                JSON.stringify({
                  id: "sameNameError",
                  message:
                    "이미 존재하는 학생이름입니다. 다른이름을 선택해 주세요",
                })
              );
              break;
            } else {
              student = new Student(message.studentName, ws, message.roomName);
            }
            rooms[roomName].students[message.studentName] = student;
            sessions[sessionId] = student;
            console.log("학생 추가 완료");
            ws.send(
              JSON.stringify({
                id: "roomExistence",
                value: "true",
                message:
                  roomName +
                  "존재하는 방이고 새로운 student 입니다. 유저정보를 세팅했습니다. 연결하세요.",
              })
            );
            /////방에 새로운 학생 입장.
            // sendRoomToAll(rooms[roomName])
          }
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }

      case "studentRequestCallOffer":
        try {
          console.log("학생에게서 call offer를 받았습니다. ");
          sessions[sessionId].sdpoffer = message.sdpOffer;
          console.log("학생의 offer저장완료. 쿠렌토와 연결 시작하겠습니다.");
          studentCall(sessionId, message.roomName, ws);
        } catch (error) {
          stop(sessionId);
        } finally {
          break;
        }

      case "studentOnIceCandidate":
        try {
          studentOnIceCandidate(sessionId, message.candidate);
        } catch (error) {
          stop(sessionId);
        } finally {
          break;
        }

      case "directorOffer":
        try {
          console.log("감독관에게서 offer를 받았습니다. ");
          console.log(message.studentName);

          sessions[sessionId].endpointPerStudent[message.studentName].sdpoffer =
            message.sdpOffer;
          console.log("감독관의 offer저장완료. 쿠렌토와 연결 시작하겠습니다.");
          directorCall(
            sessionId,
            message.directorName,
            message.studentName,
            message.roomName,
            message.sdpOffer
          );
        } catch (error) {
          stop(sessionId);
        } finally {
          break;
        }
      //todo

      case "camDirectorOffer":
        try {
          console.log("감독관에게서 offer를 받았습니다. ");
          console.log(message.camName);

          sessions[sessionId].endpointPerCam[message.camName].sdpoffer =
            message.sdpOffer;
          console.log("감독관의 offer저장완료. 쿠렌토와 연결 시작하겠습니다.");
          camDirectorCall(
            sessionId,
            message.directorName,
            message.camName,
            message.roomName,
            message.sdpOffer
          );
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }
      //todo

      case "directorOnIceCandidate":
        try {
          directorOnIceCandidate(
            sessionId,
            message.directorName,
            message.studentName,
            message.candidate
          );
        } catch (error) {
          stop(sessionId);
        } finally {
          break;
        }

      case "camDirectorOnIceCandidate":
        try {
          camDirectorOnIceCandidate(
            sessionId,
            message.directorName,
            message.camName,
            message.candidate
          );
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }

      case "camTryCall":
        try {
          // if (sessions[sessionId]){
          //     console.log("한 세션에서 두개의 Cam 로그인시도. 차단합니다.")
          //     ws.send(JSON.stringify({
          //         id : 'sessionError',
          //         message : '한 세션에서 두개의 Cam 로그인시도. 차단합니다. 재접속을 권장합니다.' + message
          //     }));
          //     break;
          // }
          roomName = message.roomName;
          if (!rooms[roomName]) {
            console.log("학생이 존재하지 않는 방에 접근중입니다.");
            ws.send(
              JSON.stringify({
                id: "roomExistence",
                value: "false",
                message:
                  message.studentName +
                  "님, 존재하지 않는 방입니다.확인해주세요.",
              })
            );
          } else {
            if (rooms[roomName].cams[message.camName]) {
              console.log("이미 존재하는 학생이름입니다.");
              ws.send(
                JSON.stringify({
                  id: "sameNameError",
                  message:
                    "이미 존재하는 캠이름입니다. 다른이름을 선택해 주세요",
                })
              );
              break;
            } else {
              cam = new Cam(message.camName, ws, message.roomName);
            }
            rooms[roomName].cams[message.camName] = cam;
            sessions[sessionId] = cam;
            console.log("cam 추가 완료");
            ws.send(
              JSON.stringify({
                id: "roomExistence",
                value: "true",
                message:
                  roomName +
                  "존재하는 방이고 새로운 cam 입니다. 유저정보를 세팅했습니다. 연결하세요",
              })
            );
            // sendRoomToAll(rooms[roomName])
          }
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }

      case "camOnIceCandidate":
        try {
          studentOnIceCandidate(sessionId, message.candidate);
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }

      case "camRequestCallOffer":
        try {
          console.log("cam에게서 call offer를 받았습니다. ");
          sessions[sessionId].sdpoffer = message.sdpOffer;
          console.log("cam의 offer저장완료. 쿠렌토와 연결 시작하겠습니다.");
          camCall(sessionId, message.roomName, ws);
        } catch (e) {
          stop(sessionId);
        } finally {
          break;
        }

      case "stop":
        stop(sessionId);
        break;

      case "adminStop":
        stop(sessionId);
        break;

      case "changeScreenResolution":
        if (!rooms[message.roomName].students[message.studentName]) {
          break;
        } else {
          rooms[message.roomName].students[message.studentName].sendMessage({
            id: "changeResolution",
          });
          break;
        }

      case "changeCamResolution":
        if (!rooms[message.roomName].cams[message.camName]) {
          break;
        } else {
          rooms[message.roomName].cams[message.camName].sendMessage({
            id: "changeResolution",
          });
          break;
        }

      case "sendChat":
        if (rooms[message.room]) {
          if (message.to == "directors") {
            directors = rooms[message.room].directors;
            for (let key in directors) {
              director = directors[key];
              if (ws != director.ws) {
                director.sendMessage(message);
                console.log(
                  "현재 존재하는 감독관: " + key + "들에게 채팅을 보내겠습니다."
                );
              }
            }
          } else if (message.to == "all") {
            directors = rooms[message.room].directors;
            for (let key in directors) {
              director = directors[key];
              if (ws != director.ws) {
                director.sendMessage(message);
                console.log(
                  "현재 존재하는 감독관: " + key + "들에게 채팅을 보내겠습니다."
                );
              }
            }
            students = rooms[message.room].students;
            for (let key in students) {
              student = students[key];
              if (ws != student.ws) {
                student.sendMessage(message);
                console.log(
                  "현재 존재하는 학생: " + key + "들에게 채팅을 보내겠습니다."
                );
              }
            }
          } else {
            students = rooms[message.room].students;
            for (let key in students) {
              student = students[key];
              if (key == message.to) {
                student.sendMessage(message);
                console.log(
                  "현재 존재하는 학생: " + key + "들에게 채팅을 보내겠습니다."
                );
              }
            }
          }
        } else {
          console.log("룸없어요 에러");
        }
        break;

      default:
        ws.send(
          JSON.stringify({
            id: "error",
            message:
              "이런 메시지는 서버가 처리할 수 없습니다.뭔가 잘못된 것 같네요. " +
              message,
          })
        );
        break;
    }
  });
});

//TODO
function studentCall(sessionId, roomName, ws) {
  try {
    // 새통화
    console.log("기존 학생의 candidate queue 삭제");
    clearCandidatesQueue(sessionId);
    // 입장요청을 한 학생
    console.log("학생 식별완료");
    var student = sessions[sessionId];

    console.log("파이프라인 만들기를 시도합니다.");
    //todo
    student.createPipeline(sessionId, roomName, ws, function (error) {
      try {
        //파이프라인을 만들었으므로, 받아논 offer를 실행해서 연결을 형성한다.
        console.log("createPipeline이후 콜백 실행하겠습니다.");
        var pipeline = sessions[sessionId].pipeline;
        var studentWebRtcEndpoint = sessions[sessionId].webRtcEndpoint;
        if (error) {
          student.sendMessage({ id: "shouldStop" });
          console.log("students.createPipeline에서 오류");
          return ws.send(error);
        }

        studentWebRtcEndpoint.processOffer(
          sessions[sessionId].sdpoffer,
          function (error, callerSdpAnswer) {
            try {
              if (error) {
                student.sendMessage({ id: "shouldStop" });
                console.log("student kurentoside 프로세스 offer도중 에러");
                return ws.send(error);
              }

              var message = {
                id: "serverToStudentSdpAnswer",
                sdpAnswer: callerSdpAnswer,
              };
              ws.send(JSON.stringify(message));
            } catch (e) {
              throw e;
            }
          }
        );

        studentWebRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            console.log("studentWebRtcEndpoint.gatherCandidates 도중 에러");
            return ws.send(error);
          }
        });
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
}

function camCall(sessionId, roomName, ws) {
  try {
    // 새통화
    console.log("기존 cam의 candidate queue 삭제");
    clearCandidatesQueue(sessionId);
    // 입장요청을 한 학생
    console.log("학생 식별완료");
    var cam = sessions[sessionId];

    console.log("cam 파이프라인 만들기를 시도합니다.");
    //todo
    cam.createPipeline(sessionId, roomName, ws, function (error) {
      try {
        //파이프라인을 만들었으므로, 받아논 offer를 실행해서 연결을 형성한다.
        console.log("cam createPipeline이후 콜백 실행하겠습니다.");
        var pipeline = sessions[sessionId].pipeline;
        var camWebRtcEndpoint = sessions[sessionId].webRtcEndpoint;
        if (error) {
          console.log("cam.createPipeline에서 오류");
          return ws.send(error);
        }

        camWebRtcEndpoint.processOffer(
          sessions[sessionId].sdpoffer,
          function (error, callerSdpAnswer) {
            try {
              if (error) {
                cam.sendMessage({ id: "shouldStop" });
                console.log("cam kurentoside 프로세스 offer도중 에러");
                return ws.send(error);
              }

              var message = {
                id: "serverToCamSdpAnswer",
                sdpAnswer: callerSdpAnswer,
              };
              ws.send(JSON.stringify(message));
            } catch (e) {
              throw e;
            }
          }
        );

        camWebRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            console.log("camWebRtcEndpoint.gatherCandidates 도중 에러");
            return ws.send(error);
          }
        });
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
}

function directorCall(
  sessionId,
  directorName,
  studentName,
  roomName,
  sdpoffer
) {
  try {
    // 새통화
    console.log("기존 감독관의 candidate queue 삭제");
    clearCandidatesQueueDirector(sessionId, studentName);
    // 입장요청을 한 학생
    console.log("감독관 식별 완료");
    var director = sessions[sessionId];

    console.log("파이프라인 가져오기를 시도합니다.");
    //todo

    var pipeline = rooms[roomName].students[studentName].pipeline;
    if (!rooms[roomName].students[studentName].dispatcher) {
      return;
    }
    //파이프라인을 가져왔으므로, 받아논 offer를 실행해서 연결을 형성한다.
    console.log("파이프라인 획득했습니다. 연결시도합니다. 실행하겠습니다.");
    console.log("파이프라인" + pipeline);
    pipeline.create("WebRtcEndpoint", function (error, directorWebRtcEndpoint) {
      try {
        if (error) {
          pipeline.release();
          return console.log("엔드포인트 생성중 오류");
        }

        director.endpointPerStudent[studentName].webRtcEndpoint =
          directorWebRtcEndpoint;
        //저장해둔 candidate가 있으면 추가한다
        console.log("저장해둔 candidates가 있으면 추가합니다. ");
        if (director.endpointPerStudent[studentName].candidatesQueue) {
          console.log("저장된 candidates를 추가합니다. ");
          while (
            director.endpointPerStudent[studentName].candidatesQueue.length
          ) {
            var candidate =
              director.endpointPerStudent[studentName].candidatesQueue.shift();
            directorWebRtcEndpoint.addIceCandidate(candidate);
          }
        }
        //onicecandidate함수를 설정한다
        console.log("쿠렌토측 endpoint의 onicecandiate설정하겠습니다. ");
        directorWebRtcEndpoint.on("OnIceCandidate", function (event) {
          var candidate = kurento.getComplexType("IceCandidate")(
            event.candidate
          );
          director.ws.send(
            JSON.stringify({
              id: "iceCandidate",
              studentName: studentName,
              candidate: candidate,
            })
          );
        });

        console.log("offer와 answer 교환하겠습니다.");
        directorWebRtcEndpoint.processOffer(
          sdpoffer,
          function (error, callerSdpAnswer) {
            console.log(sdpoffer);
            if (error) {
              return console.log(
                "director kurentoside 프로세스 offer도중 에러"
              );
              // return ws.send(error);
            }

            var message = {
              id: "serverToDirectorSdpAnswer",
              studentName: studentName,
              sdpAnswer: callerSdpAnswer,
            };
            director.sendMessage(message);
          }
        );
        directorWebRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            console.log("directorWebRtcEndpoint.gatherCandidates 도중 에러");
            // return ws.send(error);
          }
        });

        console.log(
          "감독관측 연결 형성되었습니다. 허브포트를 만들고, 감독관측 webrtcendpoint와 연결해보겠씁니다."
        );
        rooms[roomName].students[studentName].dispatcher.createHubPort(
          function (error, outputHubport) {
            try {
              console.log("허브포트 생성완료");
              if (error) {
                return console.log("createHubPort 에러 발생");
              }
              outputHubport.connect(directorWebRtcEndpoint);
            } catch (e) {
              throw e;
            }
          }
        );
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
}
function camDirectorCall(sessionId, directorName, camName, roomName, sdpoffer) {
  try {
    // 새통화
    console.log("기존 감독관의 candidate queue 삭제");
    camClearCandidatesQueueDirector(sessionId, camName);
    // 입장요청을 한 학생
    console.log("감독관 식별 완료");
    var director = sessions[sessionId];

    console.log("파이프라인 가져오기를 시도합니다.");
    //todo

    var pipeline = rooms[roomName].cams[camName].pipeline;
    if (!rooms[roomName].cams[camName].dispatcher) {
      return;
    }
    //파이프라인을 가져왔으므로, 받아논 offer를 실행해서 연결을 형성한다.
    console.log("파이프라인 획득했습니다. 연결시도합니다. 실행하겠습니다.");
    console.log("파이프라인" + pipeline);
    pipeline.create("WebRtcEndpoint", function (error, directorWebRtcEndpoint) {
      try {
        if (error) {
          pipeline.release();
          return console.log("엔드포인트 생성중 오류");
        }

        director.endpointPerCam[camName].webRtcEndpoint =
          directorWebRtcEndpoint;
        //저장해둔 candidate가 있으면 추가한다
        console.log("저장해둔 candidates가 있으면 추가합니다. ");
        if (director.endpointPerCam[camName].candidatesQueue) {
          console.log("저장된 candidates를 추가합니다. ");
          while (director.endpointPerCam[camName].candidatesQueue.length) {
            var candidate =
              director.endpointPerCam[camName].candidatesQueue.shift();
            directorWebRtcEndpoint.addIceCandidate(candidate);
          }
        }
        //onicecandidate함수를 설정한다
        console.log("쿠렌토측 endpoint의 onicecandiate설정하겠습니다. ");
        directorWebRtcEndpoint.on("OnIceCandidate", function (event) {
          var candidate = kurento.getComplexType("IceCandidate")(
            event.candidate
          );
          director.ws.send(
            JSON.stringify({
              id: "camIceCandidate",
              camName: camName,
              candidate: candidate,
            })
          );
        });

        console.log("offer와 answer 교환하겠습니다.");
        directorWebRtcEndpoint.processOffer(
          sdpoffer,
          function (error, callerSdpAnswer) {
            console.log(sdpoffer);
            if (error) {
              return console.log(
                "director kurentoside 프로세스 offer도중 에러"
              );
              // return ws.send(error);
            }

            var message = {
              id: "camServerToDirectorSdpAnswer",
              camName: camName,
              sdpAnswer: callerSdpAnswer,
            };
            director.sendMessage(message);
          }
        );
        directorWebRtcEndpoint.gatherCandidates(function (error) {
          if (error) {
            console.log("directorWebRtcEndpoint.gatherCandidates 도중 에러");
            // return ws.send(error);
          }
        });

        console.log(
          "감독관측 연결 형성되었습니다. 허브포트를 만들고, 감독관측 webrtcendpoint와 연결해보겠씁니다."
        );
        rooms[roomName].cams[camName].dispatcher.createHubPort(function (
          error,
          outputHubport
        ) {
          try {
            console.log("허브포트 생성완료");
            if (error) {
              return console.log("createHubPort 에러 발생");
            }
            outputHubport.connect(directorWebRtcEndpoint);
          } catch (e) {
            throw e;
          }
        });
      } catch (e) {
        throw e;
      }
    });
  } catch (e) {
    throw e;
  }
}

//세션아이디로, 그 사람의 저장해둔 candidates를 지운다.
function clearCandidatesQueue(sessionId) {
  if (sessions[sessionId].candidatesQueue) {
    delete sessions[sessionId].candidatesQueue;
  }
}

function clearCandidatesQueueDirector(sessionId, studentName) {
  if (sessions[sessionId].endpointPerStudent[studentName].candidatesQueue) {
    delete sessions[sessionId].endpointPerStudent[studentName].candidatesQueue;
  }
}

function camClearCandidatesQueueDirector(sessionId, camName) {
  if (sessions[sessionId].endpointPerCam[camName].candidatesQueue) {
    delete sessions[sessionId].endpointPerCam[camName].candidatesQueue;
  }
}

//sessionid 해당하는 유저의 webrtcendpoint가 있다면 addicecandidate.없다면 유저에게 cadidatesQueue를 만들어주고 거기에 저장해둠.
function studentOnIceCandidate(sessionId, candidate) {
  try {
    var candidate = kurento.getComplexType("IceCandidate")(candidate);
    var student = sessions[sessionId];
    if (student.webRtcEndpoint) {
      console.log("학생에게 addIceCandidate하겠습니다.");
      var webRtcEndpoint = student.webRtcEndpoint;
      webRtcEndpoint.addIceCandidate(candidate);
    } else {
      console.log(
        "아직 해당유저의 webrtcEndpoint가 없으므로 큐에 저장하겠습니다."
      );
      if (!sessions[sessionId].candidatesQueue) {
        console.log("해당유저의 빈 candidatesQueue생성합니다.");
        sessions[sessionId].candidatesQueue = [];
      }
      sessions[sessionId].candidatesQueue.push(candidate);
    }
  } catch (e) {
    throw e;
  }
}

//sessionid 해당하는 유저의 webrtcendpoint가 있다면 addicecandidate.없다면 유저에게 cadidatesQueue를 만들어주고 거기에 저장해둠.
function directorOnIceCandidate(
  sessionId,
  directorName,
  studentName,
  candidate
) {
  try {
    var candidate = kurento.getComplexType("IceCandidate")(candidate);
    var director = sessions[sessionId];
    if (director.endpointPerStudent[studentName].webRtcEndpoint) {
      console.log("direcotr에게 addIceCandidate하겠습니다.");
      var webRtcEndpoint =
        director.endpointPerStudent[studentName].webRtcEndpoint;
      webRtcEndpoint.addIceCandidate(candidate);
    } else {
      console.log(
        "아직 해당유저의 webrtcEndpoint가 없으므로 큐에 저장하겠습니다."
      );
      if (!director.endpointPerStudent[studentName].candidatesQueue) {
        console.log("해당유저의 빈 candidatesQueue생성합니다.");
        director.endpointPerStudent[studentName].candidatesQueue = [];
      }
      director.endpointPerStudent[studentName].candidatesQueue.push(candidate);
    }
  } catch (e) {
    throw e;
  }
}

function camDirectorOnIceCandidate(
  sessionId,
  directorName,
  camName,
  candidate
) {
  try {
    var candidate = kurento.getComplexType("IceCandidate")(candidate);
    var director = sessions[sessionId];
    if (director.endpointPerCam[camName].webRtcEndpoint) {
      console.log("direcotr에게 addIceCandidate하겠습니다.");
      var webRtcEndpoint = director.endpointPerCam[camName].webRtcEndpoint;
      webRtcEndpoint.addIceCandidate(candidate);
    } else {
      console.log(
        "아직 해당유저의 webrtcEndpoint가 없으므로 큐에 저장하겠습니다."
      );
      if (!director.endpointPerCam[camName].candidatesQueue) {
        console.log("해당유저의 빈 candidatesQueue생성합니다.");
        director.endpointPerCam[camName].candidatesQueue = [];
      }
      director.endpointPerCam[camName].candidatesQueue.push(candidate);
    }
  } catch (e) {
    throw e;
  }
}

function stop(sessionId) {
  if (!sessions[sessionId]) {
    return;
  }
  if (sessions[sessionId].constructor.name == "Student") {
    var student = sessions[sessionId];
    var roomName = student.roomName;
    delete sessions[sessionId];
    delete rooms[student.roomName].students[student.name];
    if (student.pipeline) {
      if (student.recorder) {
        student.recorder.stop();
        delete student.recorder;
      }

      student.pipeline.release();
      for (let key in rooms[roomName].directors) {
        if (rooms[roomName].directors[key].endpointPerStudent[student.name]) {
          delete rooms[roomName].directors[key].endpointPerStudent[
            student.name
          ];
        }

        message = {
          id: "studentStopped",
          studentName: student.name,
          roomName: student.roomName,
          message: student.name + " 학생에게 stop요청받음",
        };
        rooms[roomName].directors[key].sendMessage(message);
        console.log(
          "현재 존재하는 감독관: " + key + "들에게 스탑요청을 보내겠습니다."
        );
      }
    }
    // sendRoomToAll(rooms[roomName])
  } else if (sessions[sessionId].constructor.name == "Cam") {
    var cam = sessions[sessionId];
    var roomName = cam.roomName;
    delete sessions[sessionId];
    delete rooms[cam.roomName].cams[cam.name];
    if (cam.pipeline) {
      if (cam.recorder) {
        cam.recorder.stop();
        delete cam.recorder;
      }

      cam.pipeline.release();
      for (let key in rooms[roomName].directors) {
        if (rooms[roomName].directors[key].endpointPerCam[cam.name]) {
          delete rooms[roomName].directors[key].endpointPerCam[cam.name];
        }

        message = {
          id: "camStopped",
          camName: cam.name,
          roomName: cam.roomName,
          message: cam.name + " cam에게 stop요청받음",
        };
        rooms[roomName].directors[key].sendMessage(message);
        console.log(
          "현재 존재하는 감독관: " + key + "들에게 스탑요청을 보내겠습니다."
        );
      }
    }
    // sendRoomToAll(rooms[roomName])
  } else if (sessions[sessionId].constructor.name == "Director") {
    var director = sessions[sessionId];
    var roomName = director.roomName;
    delete sessions[sessionId];
    delete rooms[roomName].directors[director.name];
    for (key in director.endpointPerStudent) {
      if (director.endpointPerStudent[key].webRtcEndpoint) {
        director.endpointPerStudent[key].webRtcEndpoint.release();
        delete director.endpointPerStudent[key];
      }
    }

    for (key in director.endpointPerCam) {
      if (director.endpointPerCam[key].webRtcEndpoint) {
        director.endpointPerCam[key].webRtcEndpoint.release();
        delete director.endpointPerCam[key];
      }
    }
    // sendRoomToAll(rooms[roomName])
  }
  if (
    rooms[roomName] &&
    Object.keys(rooms[roomName].directors).length === 0 &&
    Object.keys(rooms[roomName].cams).length === 0 &&
    Object.keys(rooms[roomName].students).length === 0
  ) {
    delete rooms[roomName];
  }
}

function sendRoomToAll(room) {
  message = {
    id: "roominfo",
    room: room,
  };

  directors = room.directors;
  for (let key in directors) {
    director = directors[key];
    director.sendMessage(message);
    console.log("현재 존재하는 감독관: " + key + "들에게 채팅을 보내겠습니다.");
  }
  students = room.students;
  for (let key in students) {
    student = students[key];
    student.sendMessage(message);
    console.log("현재 존재하는 학생: " + key + "들에게 채팅을 보내겠습니다.");
  }
}

//app.use(express.static(path.join(__dirname, 'static')));
