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
var director = {

};



//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function() {
	console = new Console();
	// setRegisterState(NOT_REGISTERED);

	//방입장버튼을 누르면, 등록한다.
	document.getElementById('directorJoin').addEventListener('click', function() {
		register();
	});

	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('directorTerminate').addEventListener('click', function() {
		stop();
	});
}

window.onbeforeunload = function() {
	ws.close();
}

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function register() {
	var directorName = document.getElementById('directorName').value;
	if (directorName == '') {
		window.alert("감독관 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	var roomName = document.getElementById('roomName').value;
	if (roomName == '') {
		window.alert("방 이름이 비어있습니다. 반드시 써주셔야 합니다.");
		return;
	}

	director.name = directorName
	director.room = roomName
	director.studentsConnection = {}
	
	var message = {
		id : 'directorJoinRoom',
		directorName : directorName,
		roomName : roomName
	};
	sendMessage(message);
	console.info("관리자" + director.name + "님이 " + director.room + " 에 접속하셨습니다.")
}



ws.onmessage = function(message) {
	var parsedMessage = JSON.parse(message.data);
	console.info('Received message: ' + message.data);
	switch (parsedMessage.id) {
		case "sameNameError":
			console.log('이미 존재하는 이름입니다. 다른이름을 선택해 주세요' )
			break
		case "sessionError":
			console.log(parsedMessage.message)
			break
		case "shouldConnect":
			console.log(parsedMessage.message)
			makeConnection(message.studentName,message.roomName)
			break
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}




function makeConnection(studentName,roomName){
	options = {
		//요기를 studentName에 연관시켜서 어케 바꿔야해
		remoteVideo: document.getElementById('screenVideoFromStudent1'),
		onicecandidate:onIceCandidate
	  }


	webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
		if(error) return onError(error);
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
		console.log("offerSdp 생성하겠습니다.")
		my_conn.createOffer((offerSdp)=>{
			my_conn.setLocalDescription(offerSdp);
			console.info('Invoking SDP offer callback function ' + location.host);
			var message = {
				id : 'directorOffer',
				directorName:director.name,
				roomName:director.room,
				sdpOffer : offerSdp.sdp
			}
			sendMessage(message);
		},
		(e)=>{console.log(e)
		})
		//학생이름에 peer매칭해서 저장해둔다.
		director.studentsConnection[studentName] = this
	});
}

function stop(){
	//TODO
}

















//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Director 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});


//감독관측 onicecandidate
function onIceCandidate(candidate) {
	console.log('이 컴퓨터의 candidate: ' + JSON.stringify(candidate));
	//이 onicecandidate는 식별될 필요가있음
	//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
	var message = {
	   id : 'direcotrOnIceCandidate',
	   directorName: director.name,
	   candidate : candidate
	}
	sendMessage(message);
}