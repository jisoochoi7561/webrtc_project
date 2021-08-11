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
var director = {
	studentsConnection : {},
	camsConnection : {}
};
var chatText;
var chatBox;


//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function() {
	// setRegisterState(NOT_REGISTERED);

	chatText = document.getElementById('chatText')
	chatBox = document.getElementById('chatBox')

	//방입장버튼을 누르면, 등록한다.
	document.getElementById('directorJoin').addEventListener('click', function() {
		register();
	});

	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('directorTerminate').addEventListener('click', function() {
		stop();
	});

	document.getElementById('sendChat').addEventListener('click', function() {
		sendChatMessage()
	});
	
	chatText.addEventListener('keyup', function(event) {
        if (event.code === 'Enter')
        {
            sendChatMessage()
        }
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
	director.camsConnection = {}

	
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
			delete director.name
			delete director.room
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
		case "camStopped":
			camStop(parsedMessage.camName)
			break
		case "sendChat":
			addMessageToChatbox(parsedMessage.from,parsedMessage.text)
			break;
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}




function startCall(studentName,roomName){

	console.log('webrtcpeer 생성을 시작합니다')
	console.log(roomName)
	//화면캡처
		my_student_element = null;
		if (document.getElementById(studentName)){
			my_student_element = document.getElementById(studentName)
		}
		else{
			my_student_element = document.createElement('div');
			my_student_element.setAttribute("id",studentName);
			my_student_element.setAttribute("style","display:inline-block");
			my_student_element.setAttribute("class","col");
			my_label = document.createElement('div');
			my_label.setAttribute("class","alert alert-success");
			my_label.innerHTML = studentName
			my_student_element.appendChild(my_label)
			document.getElementById('videoLists').appendChild(my_student_element)
		}
		my_element = document.createElement('video');
		my_element.setAttribute("id",studentName+"screen!");
		// my_element.setAttribute("width","240px");
		// my_element.setAttribute("height","180px");
		my_element.setAttribute('autoplay', true);
		my_element.setAttribute('muted', true);
		my_element.setAttribute('playsinline', true);
		my_element.setAttribute("style","display: inline")
		let reso_message = {
			id: "changeScreenResolution",
			studentName:studentName,
			roomName:roomName
		}
		
		my_student_element.appendChild(my_element)

		my_element.addEventListener('click', function() {
			console.log(studentName);
			sendMessage(reso_message);
		});
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
			my_student_element.setAttribute("class","col");
			my_student_element.setAttribute("style","display:inline-block");
			my_label = document.createElement('div');
			my_label.innerHTML = camName
			my_label.setAttribute("class","alert alert-success");
			my_student_element.appendChild(my_label)
			document.getElementById('videoLists').appendChild(my_student_element)
		}
		my_element = document.createElement('video');
		my_element.setAttribute("style","display: inline")
		my_element.setAttribute("id",camName+"cam!");
		// my_element.setAttribute("width","240px");
		// my_element.setAttribute("height","180px");
		my_element.setAttribute('autoplay', true);
		my_element.setAttribute('muted', true);
		my_element.setAttribute('playsinline', true);
		let reso_message = {
			id: "changeCamResolution",
			camName:camName,
			roomName:roomName
		}
		
		my_student_element.appendChild(my_element)

		my_element.addEventListener('click', function() {
			sendMessage(reso_message);
		});
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
	for (key in director.studentsConnection){
		director.studentsConnection[key].peer.dispose()
		document.getElementById(key+"screen!").remove();
		delete director.studentsConnection[key]
	}
	for (key in director.camsConnection){
		director.camsConnection[key].peer.dispose()
		document.getElementById(key+"cam!").remove();
		delete director.camsConnection[key]
	}
	var message = {
		id : 'adminStop'
	}
	sendMessage(message);
}




function studentStop(studentName){
	console.log(studentName+"학생이 화면 공유를 끄셨습니다")
	if (director.studentsConnection[studentName]){
		delete director.studentsConnection[studentName]
	}	
	if( document.getElementById(studentName+"screen!")){
		console.log("remove screen!")
		document.getElementById(studentName+"screen!").remove();
	}
	if( !document.getElementById(studentName+"cam!")){
		console.log("div delete!")
		document.getElementById(studentName).remove();
	}
}

function camStop(camName){
	console.log(camName+"학생이 캠 공유를 끄셨습니다")
	if (director.camsConnection[camName]){
		delete director.camsConnection[camName]
	}	
	if( document.getElementById(camName+"cam!")){
		console.log("remove cam!")
		document.getElementById(camName+"cam!").remove();
	}
	if( !document.getElementById(camName+"screen!")){
		console.log("div delete!")
		document.getElementById(camName).remove();
	}
}









//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Director 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}



function sendChatMessage(to="all"){
	console.log("sending 채팅 message")
//웹소켓으로 메시지를 보낸다.
message = {
	id : 'sendChat',
	from: director.name,
	room: director.room,
	text:chatText.value,
	to:to
}
// addMessageToChatbox(message.from,message.text,"red")
sendMessage(message);
addMessageToChatbox(message.from,message.text,"blue")
//비운다.
chatText.value=""
}


function addMessageToChatbox(name,message,color = "black"){
	if(message==""){return}
	console.log("리시빙~")
	var now = new Date();
	chatBox.innerHTML = `${chatBox.innerHTML} <span style='color:${color}'> ${name}: ${message} - ${now.getHours()}시 ${now.getMinutes()}분 <br></span>`
	// chatBox.innerHTML =chatBox.innerHTML+ "<span style='color:red'>"+name +": "+ message + "- " + now.getHours() + "시" + now.getMinutes() + "분<br></span>"
	}

	function systemAddMessageToChatbox(message){
		addMessageToChatbox("프로그램",message,"green")
	
	}