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



var ws = new WebSocket('wss://' + location.host + '/one2one');
var student = {};



//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function() {
	console = new Console();
	// setRegisterState(NOT_REGISTERED);

	//방입장버튼을 누르면, 등록한다.
	document.getElementById('studentCall').addEventListener('click', function() {
		tryCall();
	});

	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('studentStop').addEventListener('click', function() {
		stop();
	});
}

window.onbeforeunload = function() {
	ws.close();
}

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function tryCall() {
	var studentName = document.getElementById('studentName').value;
	if (studentName == '') {
		window.alert("학생 이름이 비어있습니다.. 반드시 써주셔야 합니다.");
		return;
	}

	var roomName = document.getElementById('roomName').value;
	if (roomName == '') {
		window.alert("방 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	student.name = studentName
	student.room = roomName
	student.ws = ws
	
	var message = {
		id : 'studentTryCall',
		studentName : studentName,
		roomName : roomName
	};
	sendMessage(message);
	console.info(student.name + "님이 " + director.room + " 에 접속시도합니다.")
}



ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	switch (parsedMessage.id) {
		case "sameNameError":
			console.log('이미 존재하는 이름입니다. 다른이름을 선택해 주세요' )
			break
		case "roomExistence":
			if (parsedMessage.value == "false"){
				console.log("존재하지 않는 방입니다.확인해주세요.")
			}else{
				console.log("방이 확인 되었습니다. 연결을 시작합니다.")

				startCall();
			}
			break
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}




















//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('student 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});


function stop(){
	//TODO
}

function startCall(){
	//TODO
}