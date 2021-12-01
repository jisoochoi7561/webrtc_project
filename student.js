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
var student = {};
var webRtcPeer;
var chatText;
var chatBox;
var tempname;
var temproom;
//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function () {
	// setRegisterState(NOT_REGISTERED);
	chatText = document.getElementById('chatText');
	chatBox = document.getElementById('chatBox');
	//방입장버튼을 누르면, 등록한다.
	document.getElementById('studentCall').addEventListener('click', function () {
		tryCall();
	});
	document.getElementById('call').addEventListener('click', function () {
		startCall();
	});
	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('studentStop').addEventListener('click', function () {
		stop();
	});
	document.getElementById('sendChat').addEventListener('click', function () {
		sendChatMessage();
	});

	chatText.addEventListener('keyup', function (event) {
		if (event.code === 'Enter') {
			sendChatMessage();
		}
	});

	systemAddMessageToChatbox("충남대학교 시험감독 프로그램에 오신 것을 환영합니다. 학생여러분은 학번과 방이름을 입력 후 입장버튼을 눌러 접속해주세요");
};

window.onbeforeunload = function () {
	ws.close();
};

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function tryCall() {
	if (student) {
		stop();
	}
	var studentName = document.getElementById('studentName').value;
	if (studentName == '') {
		window.alert("학생 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	var roomName = document.getElementById('roomName').value;
	if (roomName == '') {
		window.alert("방 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	var message = {
		id: 'studentTryCall',
		studentName: studentName,
		roomName: roomName,
		type: student.type
	};
	tempname = studentName;
	temproom = roomName;
	sendMessage(message);
	console.info(tempname + "님이 " + temproom + " 에 접속시도합니다.");
	systemAddMessageToChatbox("유저 정보를 확인중입니다.");
}

ws.onmessage = function (message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	switch (parsedMessage.id) {
		case "sameNameError":
			console.log('이미 존재하는 이름입니다. 다른이름을 선택해 주세요');
			systemAddMessageToChatbox('이미 존재하는 이름입니다. 다른이름을 선택해 주세요');
			delete student.name;
			delete student.room;
			break;
		case "roomExistence":
			if (parsedMessage.value == "false") {
				console.log("존재하지 않는 방입니다.확인해주세요.");
				systemAddMessageToChatbox("존재하지 않는 방입니다.확인해주세요.");
				delete student.name;
				delete student.room;
			} else {
				student.name = tempname;
				student.room = temproom;
				systemAddMessageToChatbox("연결되었습니다. 이제 감독관에게 채팅할 수 있습니다.");
				systemAddMessageToChatbox("공유시작버튼을 눌러 화면공유를 시작해주세요.");
			}
			break;
		case "sessionError":
			console.log(parsedMessage.message);
			systemAddMessageToChatbox("에러발생.재접속 하거나 관리자에게 문의 요망.");
			break;

		case 'iceCandidate':
			webRtcPeer.addIceCandidate(parsedMessage.candidate);
			break;

		case 'serverToStudentSdpAnswer':
			webRtcPeer.processAnswer(parsedMessage.sdpAnswer);
			break;
		case 'shouldStop':
			stop();
			break;
		case 'changeResolution':
			console.log("changeResol start");
			console.log();
			if (webRtcPeer.getLocalStream().getVideoTracks()[0].getConstraints().width <= 320) {
				webRtcPeer.getLocalStream().getVideoTracks()[0].applyConstraints({
					width: 1280,
					height: 720
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

		case "sendChat":
			addMessageToChatbox(parsedMessage.from, parsedMessage.text);
			break;
		case 'roominfo':
			// document.getElementById("roomBox").innerHTML = message.data
			break;
		case 'roomsKeys':
			console.log(parsedMessage);
			// document.getElementById("roomBox").innerHTML = message.data
			break;

		default:
			console.error('Unrecognized message', parsedMessage);
	}
};

function startCall() {
	if (webRtcPeer) {
		systemAddMessageToChatbox('이미 전송중입니다.');
		console.log("이미 전송중입니다.");
		return;
	}
	if (!student.name) {
		systemAddMessageToChatbox('유저가 제대로 입장되지 않았습니다.');
		console.log("학생 미등록");
		return;
	}

	console.log('화면전송을 시작합니다');
	systemAddMessageToChatbox("화면전송을 시작합니다.");
	//화면캡처의 경우에는 audio는 필요하지 않음
	var constraints = {
		video: { width: 854, height: 480, frameRate: 15 },
		audio: false

		//화면캡처
	};navigator.mediaDevices.getDisplayMedia().then(function (stream) {
		my_stream = stream;
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

		//현재옵션:
		//스트림 = 화면
		//로컬스트림 출력 세팅
		my_configuration = {
			iceServers: [{ "urls": "turn:turn.cnuclassroom.shop", "username": "kurento", "credential": "kurento" }]
		};
		options = {
			videoStream: my_stream,
			localVideo: document.getElementById('localstream'),
			remoteVideo: document.getElementById('remotestream'),
			onicecandidate: onIceCandidate,
			configuration: my_configuration
		};

		webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function (error) {
			if (error) return console.log(error);
			// i'll work with my peerconnection
			my_conn = this.peerConnection;

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
					id: 'studentRequestCallOffer',
					studentName: student.name,
					roomName: student.room,
					sdpOffer: offerSdp.sdp
				};
				sendMessage(message);
			}, function (e) {
				console.log(e);
			});
		});
	});
}

function onIceCandidate(candidate) {
	console.log('이 컴퓨터의 candidate: ' + JSON.stringify(candidate));
	//이 onicecandidate는 식별될 필요가있음
	//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
	var message = {
		id: 'studentOnIceCandidate',
		studentName: student.name,
		candidate: candidate
	};
	sendMessage(message);
}

//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('student 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}

function stop() {
	systemAddMessageToChatbox("작동정지.");
	console.log("작동을 정지하겠습니다.");
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	if (student) {
		student = {};
	}
	var message = {
		id: 'stop'
	};
	sendMessage(message);
}

function sendChatMessage() {
	var to = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : "directors";

	console.log("sending 채팅 message");
	if (!student.name) {
		systemAddMessageToChatbox("제대로 접속이 안되있습니다.입장버튼을 다시 눌러주세요.");
		console.log("등록되지 않은 학생은 사용불가");
		return;
	}
	//웹소켓으로 메시지를 보낸다.ㅏㄹ
	message = {
		id: 'sendChat',
		from: student.name,
		room: student.room,
		text: chatText.value,
		to: to
	};
	sendMessage(message);
	addMessageToChatbox(message.from, message.text, "blue");
	// sendMessage(message);
	//비운다.
	chatText.value = "";
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