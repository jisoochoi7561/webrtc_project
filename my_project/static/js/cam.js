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
var webRtcPeer ; 


//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function() {
	console = new Console();
	// setRegisterState(NOT_REGISTERED);

	//방입장버튼을 누르면, 등록한다.
	document.getElementById('camCall').addEventListener('click', function() {
		tryCall();
	});
	//사파리용 공유버튼 추가!
	document.getElementById('call').addEventListener('click', function() {
		startCall();
	});

	//종료버튼을 누르면 시험을 종료한다.
	document.getElementById('camStop').addEventListener('click', function() {
		stop();
	});

	document.getElementById('call').style.display = 'none';
}

window.onbeforeunload = function() {
	ws.close();
}

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function tryCall() {
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

	cam.name = camName
	cam.room = roomName
	
	var message = {
		id : 'camTryCall',
		camName : camName,
		roomName : roomName,
	};
	sendMessage(message);
	console.info(cam.name + " cam 님이 " + cam.room + " 에 접속시도합니다.")
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
				console.log("방이 확인 되었습니다. 공유를 시작해주세요")
				document.getElementById('call').style.display = 'inline-block';
			}
			break
		case "sessionError":
			console.log(parsedMessage.message)
			break

		case 'iceCandidate':
			webRtcPeer.addIceCandidate(parsedMessage.candidate)
			break;


		case 'serverToCamSdpAnswer':
			webRtcPeer.processAnswer(parsedMessage.sdpAnswer)
			break;
		case 'shouldStop':
			stop();
			break;	

			case 'changeResolution':
			console.log("changeResol start")
			console.log()
			if (webRtcPeer.getLocalStream().getVideoTracks()[0].getConstraints().width == 320){
				webRtcPeer.getLocalStream().getVideoTracks()[0].applyConstraints({
					width:640,
					height:480
				}).then(() => {
					console.log("applyConstraints!!")
				  })
				  .catch(e => {
					console.log("applyConstraints FAILLLL!!")
					console.log(e)
					// The constraints could not be satisfied by the available devices.
				  });
				console.log("changeResol done")
				break;
			}
			else{
				webRtcPeer.getLocalStream().getVideoTracks()[0].applyConstraints({
					width:320,
					height:240
				}).then(() => {
					console.log("applyConstraints!!")
				  })
				  .catch(e => {
					console.log("applyConstraints FAILLLL!!")
					console.log(e)
					// The constraints could not be satisfied by the available devices.
				  });
				console.log("changeResol done")
				break;
			}
			
	default:
		console.error('Unrecognized message', parsedMessage);
	}
}




function startCall(){

	console.log('화면전송을 시작합니다')
	//화면캡처의 경우에는 audio는 필요하지 않음
	var constraints = {
		video: {width: 320, height: 240,framerate:15},
		audio: false
	}


	my_configuration = {
		iceServers : [
			{"urls":"turn:168.188.129.207:8080","username":"kurento","credential":"kurento"}]
	}
	//현재옵션:
		options = {
			localVideo: document.getElementById('localstream'),
			remoteVideo: document.getElementById('remotestream'),
			onicecandidate:onIceCandidate,
			mediaConstraints:constraints,
			configuration:my_configuration
		  }
		  
	
		  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error) {
			if(error) return console.log(error);
			// i'll work with my peerconnection
			my_conn = this.peerConnection;
			stream = this.getLocalStream();
			stream.getVideoTracks()[0].addEventListener('ended', () => 
			stop()


			
);
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



			console.log(typeof(stream))

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
					id : 'camRequestCallOffer',
					camName:cam.name,
					roomName:cam.room,
					sdpOffer : offerSdp.sdp
				}
				sendMessage(message);
			},
			(e)=>{console.log(e)
			})
		});
	
	
		document.getElementById('call').style.display = 'none';
	//TODO
}




function onIceCandidate(candidate) {
	console.log('이 CAM 의 candidate: ' + JSON.stringify(candidate));
	//이 onicecandidate는 식별될 필요가있음
	//이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
	var message = {
	   id : 'camOnIceCandidate',
	   camName: cam.name,
	   candidate : candidate
	}
	sendMessage(message);
}










//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('student CAM 가 앱서버에 메시지 보내는중: ' + jsonMessage);
	ws.send(jsonMessage);
}


/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});


function stop() {
	console.log("작동을 정지하겠습니다.")
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;
	}
	var message = {
		id : 'stop'
	}
	sendMessage(message);
}


