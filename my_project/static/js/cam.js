/*
 * (C) Copyright 2014-2015 Kurento (http://kurento.org/)
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

var ws = new WebSocket('wss://' + location.host + '/websocket');
var cam = {};
var webRtcPeer;
var tempcam;
var temproom;
var my_switch;

//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function () {
	// setRegisterState(NOT_REGISTERED);

	//방입장버튼을 누르면, 등록한다.
	document.getElementById('camCall').addEventListener('click', function () {
		tryCall();
	});
	//사파리용 공유버튼 추가!
	document.getElementById('call').addEventListener('click', function () {
		startCall();
	});

	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('camStop').addEventListener('click', function () {
		stop();
	});
	my_switch = document.getElementById('front-camera-switch');
	systemAddMessageToChatbox("충남대학교 시험감독 캠 페이지 입니다. 화면공유시 사용한 이름과 같은 이름을 사용해 주세요.");
};

window.onbeforeunload = function () {
	ws.close();
};

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function tryCall() {
	if (cam) {
		stop();
	}
	var camName = document.getElementById('camName').value;
	if (camName == '') {
		window.alert("학생 이름이 비어있습니다.. 반드시 써주셔야 합니다.");
		return;
	}

	var roomName = document.getElementById('roomName').value;
	if (roomName == '') {
		window.alert("방 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	var message = {
		id: 'camTryCall',
		camName: camName,
		roomName: roomName
	};
	tempcam = camName;
	temproom = roomName;
	sendMessage(message);
	console.info(tempcam + " cam 님이 " + temproom + " 에 접속시도합니다.");
	systemAddMessageToChatbox("유저 정보를 확인중입니다.");
}

ws.onmessage = function (message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	switch (parsedMessage.id) {
		case "sameNameError":
			systemAddMessageToChatbox('이미 존재하는 이름입니다. 다른이름을 선택해 주세요');
			console.log('이미 존재하는 이름입니다. 다른이름을 선택해 주세요');
			delete cam.name;
			delete cam.room;
			break;
		case "roomExistence":
			if (parsedMessage.value == "false") {
				console.log("존재하지 않는 방입니다.확인해주세요.");
				systemAddMessageToChatbox("존재하지 않는 방입니다.확인해주세요.");
				delete cam.name;
				delete cam.room;
			} else {
				cam.name = tempcam;
				cam.room = temproom;
				console.log("방이 확인 되었습니다. 공유를 시작해주세요");
				systemAddMessageToChatbox("공유시작버튼을 눌러 캠 화면을 공유해주세요.");
			}
			break;
		case "sessionError":
			console.log(parsedMessage.message);
			systemAddMessageToChatbox("에러발생.재접속 하거나 관리자에게 문의 요망.");
			break;

		case 'iceCandidate':
			webRtcPeer.addIceCandidate(parsedMessage.candidate);
			break;

		case 'serverToCamSdpAnswer':
			webRtcPeer.processAnswer(parsedMessage.sdpAnswer);
			break;
		case 'shouldStop':
			stop();
			break;

		case 'changeResolution':
			console.log("changeResol start");
			console.log();
			if (webRtcPeer.getLocalStream().getVideoTracks()[0].getConstraints().width == 320) {
				webRtcPeer.getLocalStream().getVideoTracks()[0].applyConstraints({
					width: 640,
					height: 480
				}).then(function () {
					console.log("applyConstraints!!");
				}).catch(function (e) {
					console.log("applyConstraints FAILLLL!!");
					console.log(e);
					// The constraints could not be satisfied by the available devices.
				});
				console.log("changeResol done");
				break;
			} else {
				webRtcPeer.getLocalStream().getVideoTracks()[0].applyConstraints({
					width: 320,
					height: 240
				}).then(function () {
					console.log("applyConstraints!!");
				}).catch(function (e) {
					console.log("applyConstraints FAILLLL!!");
					console.log(e);
					// The constraints could not be satisfied by the available devices.
				});
				console.log("changeResol done");
				break;
			}

		default:
			console.error('Unrecognized message', parsedMessage);
	}
};

function startCall() {
	if (webRtcPeer) {
		console.log("이미 전송중입니다.");
		systemAddMessageToChatbox('이미 전송중입니다.');
		return;
	}
	if (!cam.name) {
		systemAddMessageToChatbox('유저가 제대로 입장되지 않았습니다.');
		console.log("학생 미등록");
		return;
	}
	console.log('화면전송을 시작합니다');
	systemAddMessageToChatbox("화면전송을 시작합니다.");
	//화면캡처의 경우에는 audio는 필요하지 않음
	if (my_switch.checked == true) {
		front = false;
	} else {
		front = true;
	}
	var constraints = {
		video: { facingMode: front ? "user" : "environment", width: 320, height: 240, frameRate: { ideal: 10, max: 15 } },
		audio: false
	};

	navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
		my_stream = stream;
		my_configuration = {
			iceServers: [{ "urls": "turn:turn.cnuclassroom.shop", "username": "kurento", "credential": "kurento" }]
		};
		options = {
			localVideo: document.getElementById('localstream'),
			remoteVideo: document.getElementById('remotestream'),
			onicecandidate: onIceCandidate,
			videoStream: my_stream,
			configuration: my_configuration
		};

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function (error) {
			if (error) return console.log(error);
			// i'll work with my peerconnection
			my_conn = this.peerConnection;
			stream = this.getLocalStream();
			stream.getVideoTracks()[0].addEventListener('ended', function () {
				return stop();
			});
			stream.getVideoTracks()[0].applyConstraints({
				width: 320, height: 240, frameRate: 15
			}).then(function () {
				console.log("applyConstraints!!");
			}).catch(function (e) {
				console.log("applyConstraints FAILLLL!!");
				console.log(e);
				// The constraints could not be satisfied by the available devices.
			});
			// stream.getVideoTracks()[0].applyConstraints({
			// 	width:1280,
			// 	height:720
			// }).then(() => {
			// 	console.log("applyConstraints!!")
			//   })
			//   .catch(e => {
			// 	console.log("applyConstraints FAILLLL!!")
			// 	console.log(e)

			// 	// The constraints could not be satisfied by the available devices.
			//   });


			// make onIceCandidate

			// my_conn.onicecandidate = ((e)=>{
			// 	if (e.candidate == null){return}

			// 	console.log('Local candidate' + JSON.stringify(candidate));
			// 	var message = {
			// 		id : 'onIceCandidate',
			// 		candidate : candidate
			// 	 };
			// 	 sendMessage(message);
			// },(error)=>{console.log(error)})

			//create my offer
			console.log("offerSdp 생성하겠습니다.");
			my_conn.createOffer(function (offerSdp) {
				my_conn.setLocalDescription(offerSdp);
				console.info('Invoking SDP offer callback function ' + location.host);
				var message = {
					id: 'camRequestCallOffer',
					camName: cam.name,
					roomName: cam.room,
					sdpOffer: offerSdp.sdp
				};
				sendMessage(message);
			}, function (e) {
				console.log(e);
			});
		});
	}).catch(function (err) {
		return console.log(err);
	});

	//현재옵션:


	//TODO
}

function onIceCandidate(candidate) {
	console.log('이 CAM 의 candidate: ' + JSON.stringify(candidate));
	//이 onicecandidate는 식별될 필요가있음
	//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...

	var message = {
		id: 'camOnIceCandidate',
		camName: cam.name,
		candidate: candidate
	};
	sendMessage(message);
}

//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('student CAM 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}

function stop() {
	systemAddMessageToChatbox("작동정지.");
	console.log("작동을 정지하겠습니다.");

	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	if (cam) {
		cam = {};
	}
	var message = {
		id: 'stop'
	};
	sendMessage(message);
}

function addMessageToChatbox(name, message) {
	var color = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : "black";

	if (message == "") {
		return;
	}
	console.log("리시빙~");
	var now = new Date();
	chatBox.innerHTML = chatBox.innerHTML + ' <span style=\'color:' + color + '\'> ' + name + ': ' + message + ' - ' + now.getHours() + '\uC2DC ' + now.getMinutes() + '\uBD84 <br></span>';
	// chatBox.innerHTML =chatBox.innerHTML+ "<span style='color:red'>"+name +": "+ message + "- " + now.getHours() + "시" + now.getMinutes() + "분<br></span>"
}

function systemAddMessageToChatbox(message) {
	addMessageToChatbox("프로그램", message, "green");
}