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
	studentsConnection : {},
	camsConnection : {}
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
			startCall(parsedMessage.studentName,parsedMessage.roomName)
			break
		case "camShouldConnect":
			console.log(parsedMessage.message)
			camStartCall(parsedMessage.camName,parsedMessage.roomName)
			break
		case "iceCandidate":
			console.log(parsedMessage.message)
			director.studentsConnection[parsedMessage.studentName].peer.addIceCandidate(parsedMessage.candidate)
			break
		case "camIceCandidate":
			console.log(parsedMessage.message)
			director.camsConnection[parsedMessage.camName].peer.addIceCandidate(parsedMessage.candidate)
			break
		case 'serverToDirectorSdpAnswer':
			director.studentsConnection[parsedMessage.studentName].peer.processAnswer(parsedMessage.sdpAnswer)
			break;
		case 'camServerToDirectorSdpAnswer':
			director.camsConnection[parsedMessage.camName].peer.processAnswer(parsedMessage.sdpAnswer)
			break;
		case "studentStopped":
			studentStop(parsedMessage.studentName)
			break
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}




function startCall(studentName,roomName){

	console.log('webrtcpeer 생성을 시작합니다')
	//화면캡처
		my_student_element = null;
		if (document.getElementById(studentName)){
			my_student_element = document.getElementById(studentName)
		}
		else{
			my_student_element = document.createElement('div');
			my_student_element.setAttribute("id",studentName);
			my_label = document.createTextNode( studentName);
			my_student_element.appendChild(my_label)
			document.getElementById('videoLists').appendChild(my_student_element)
		}
		my_element = document.createElement('video');
		my_element.setAttribute("id",studentName+"screen!");
		my_element.setAttribute("width","240px");
		my_element.setAttribute("height","180px");
		my_element.setAttribute('autoplay', true);
		
		my_student_element.appendChild(my_element)
		//현재옵션:
		//스트림 = 화면
		//로컬스트림 출력 세팅
		options = {
			remoteVideo: document.getElementById(studentName+"screen!"),
			onicecandidate:function (candidate) {
				console.log("hi");
				console.log('이 컴퓨터의 candidate: ' + JSON.stringify(candidate));
				//이 onicecandidate는 식별될 필요가있음
				//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
				var message = {
				   id : 'directorOnIceCandidate',
				   directorName:director.name,
				   studentName: studentName,
				   candidate : candidate
				}
				sendMessage(message);
			}
			
		  }
	
		  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
			if(error) return onError(error);
			// i'll work with my peerconnection
	
			
	
			//create my offer
			console.log("director측 offerSdp 생성하겠습니다.")
			this.generateOffer((error,offerSdp)=>{
				var message = {
					id : 'directorOffer',
					directorName:director.name,
					studentName:studentName,
					roomName:director.room,
					sdpOffer : offerSdp
				}
				sendMessage(message);
			});
			director.studentsConnection[studentName] = {}
			director.studentsConnection[studentName].peer = this
			console.log("reached directorStartCall end")
		});
	
	


	//TODO
}



function camStartCall(camName,roomName){

	console.log('webrtcpeer 생성을 시작합니다')
	//화면캡처
		my_student_element = null;
		if (document.getElementById(camName)){
			my_student_element = document.getElementById(camName)
		}
		else{
			my_student_element = document.createElement('div');
			my_student_element.setAttribute("id",camName);
			my_label = document.createTextNode( camName);
			my_student_element.appendChild(my_label)
			document.getElementById('videoLists').appendChild(my_student_element)
		}
		my_element = document.createElement('video');
		my_element.setAttribute("id",camName+"cam!");
		my_element.setAttribute("width","240px");
		my_element.setAttribute("height","180px");
		my_element.setAttribute('autoplay', true);
		
		my_student_element.appendChild(my_element)
		//현재옵션:
		//스트림 = 화면
		//로컬스트림 출력 세팅
		options = {
			remoteVideo: document.getElementById(camName+"cam!"),
			onicecandidate:function (candidate) {
				console.log("hi");
				console.log('이 컴퓨터의 candidate: ' + JSON.stringify(candidate));
				//이 onicecandidate는 식별될 필요가있음
				//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
				var message = {
				   id : 'camDirectorOnIceCandidate',
				   directorName:director.name,
				   camName: camName,
				   candidate : candidate
				}
				sendMessage(message);
			}
			
		  }
	
		  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
			if(error) return onError(error);
			// i'll work with my peerconnection
	
			
	
			//create my offer
			console.log("director측 offerSdp 생성하겠습니다.")
			this.generateOffer((error,offerSdp)=>{
				var message = {
					id : 'camDirectorOffer',
					directorName:director.name,
					camName:camName,
					roomName:director.room,
					sdpOffer : offerSdp
				}
				sendMessage(message);
			});
			director.camsConnection[camName] = {}
			director.camsConnection[camName].peer = this
			console.log("reached directorStartCall end")
		});
	
	


	//TODO
}


function stop(){
	//TODO
}




function studentStop(studentName){
	if (director.studentsConnection[studentName]){
		delete director.studentsConnection[studentName]
	}	
	if( document.getElementById(studentName+"screen!")){
		document.getElementById(studentName+"screen!").remove();
	}
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


