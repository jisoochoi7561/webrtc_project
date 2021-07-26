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




//sucere websocket connection to localhost node app server

var director_db = ["GOD","ADMIN","WILDMAN"]

var director = null
var student = null



var ws = new WebSocket('wss://' + location.host + '/helloworld');
var videoInput;
var videoOutput;
var videoOutput2;
var webRtcPeer;
var state = null;
var my_conn;
var my_stream;
var options;

const I_CAN_START = 0;
const I_CAN_STOP = 1;
const I_AM_STARTING = 2;

// onload -> you should not run script before everything(like index.html) loads
window.onload = function() {
	//make new(blank) console 
	console = new Console();
	console.log('Page loaded ...');
	//configure local video
	videoInput = document.getElementById('videoInput');
	//configure remote video
	videoOutput = document.getElementById('videoOutput');
	videoOutput2 = document.getElementById('videoOutput2');
	document.getElementById('makeRoom').addEventListener('click', function() {
		directorRecognize();
	});
	document.getElementById('joinRoom').addEventListener('click', function() {
		studentRecognize();
	});
	setState(I_CAN_START);
}

// onbeforeunlaod -> event when you leave page
window.onbeforeunload = function() {
	//should close websocket connection
	ws.close();
}

// make websocket message handler
ws.onmessage = function(message) {
	// websocket messages
	// server will send message data as JSON so parse it
	var parsedMessage = JSON.parse(message.data);

	console.info('Received message: ' + message.data);

	switch (parsedMessage.id) {
	case 'startResponse':
		// when you get message "startResponse"
		// it means someone responsed to make webrtc connetc and gave you "sdp answer"
		// so start treat Response 	
		startResponse(parsedMessage);
		break;
	case 'error':
		// if there was an error message
		// go back to intial state
		if (state == I_AM_STARTING) {
			setState(I_CAN_START);
		}
		onError('Error message from server: ' + parsedMessage.message);
		break;
	case 'iceCandidate':
		// server sent you "icecandidate"
		// it means other peer gave you their icecandiate
		// so you should add it to your peer connection with "addicecandidate"
		my_conn.addIceCandidate(parsedMessage.candidate)
		break;
	default:
		// default means something unrecognized so act as error
		if (state == I_AM_STARTING) {
			setState(I_CAN_START);
		}
		onError('Unrecognized message', parsedMessage);
	}
}

function start() {

	//this is logic to start webrtc call when you click "start" button
	console.log('Starting video call ...')

	// Disable start button
	setState(I_AM_STARTING);
	// show spinner while loading
	showSpinner(videoInput, videoOutput);


	// should make WebRTCPeer and make all the signals
	console.log('Creating WebRtcPeer and generating local sdp offer ...');


	// this is option to configure peer connection and local stream. it is not pure webrtc it is kurentoUtils.js so has little different configuration. you should change it.
	// it is configuring html element to print media stream. you know its little different from pure webrtc
    var constraints = {
		video: true,
		audio: false
	}

	
	  
	navigator.mediaDevices.getDisplayMedia().then(stream =>{
		my_stream = stream
		options = {
			videoStream: my_stream,
			remoteVideo: videoOutput,
			
			onicecandidate:function(candidate){
				console.log('Local candidate' + JSON.stringify(candidate));
	
		   var message = {
			  id : 'onIceCandidate',
			  candidate : candidate
		   };
		   sendMessage(message);
			}
		  }
	
		  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerSendrecv(options, function(error) {
			videoInput.srcObject = my_stream
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
			my_conn.createOffer((offerSdp)=>{
				my_conn.setLocalDescription(offerSdp);
				console.info('Invoking SDP offer callback function ' + location.host);
				var message = {
					id : 'start',
					sdpOffer : offerSdp.sdp
				}
				sendMessage(message);
			},
			(e)=>{console.log(e)
			})
		});
	
	
	})
	
	// it is making webrtcpeerconnection in kurento-utils-way.
	// it looks like it makes peerconnection,sets streams, and then add it into peerconnection.
    
}

function onError(error) {
	console.error(error);
}

function startResponse(message) {
	// you got answer from peer
	// so set in remotedescription. you should do it with pure webrtc API
	setState(I_CAN_STOP);
	console.log('SDP answer received from server. Processing ...');
	webRtcPeer.processAnswer(message.sdpAnswer);
}

function stop() {
	console.log('Stopping video call ...');
	setState(I_CAN_START);
	if (webRtcPeer) {
		webRtcPeer.dispose();
		webRtcPeer = null;

		var message = {
			id : 'stop'
		}
		sendMessage(message);
	}
	hideSpinner(videoInput, videoOutput);
}

function setState(nextState) {
	switch (nextState) {
	case I_CAN_START:
		$('#start').attr('disabled', false);
		$('#start').attr('onclick', 'start()');
		$('#stop').attr('disabled', true);
		$('#stop').removeAttr('onclick');
		break;

	case I_CAN_STOP:
		$('#start').attr('disabled', true);
		$('#stop').attr('disabled', false);
		$('#stop').attr('onclick', 'stop()');
		break;

	case I_AM_STARTING:
		$('#start').attr('disabled', true);
		$('#start').removeAttr('onclick');
		$('#stop').attr('disabled', true);
		$('#stop').removeAttr('onclick');
		break;

	default:
		onError('Unknown state ' + nextState);
		return;
	}
	state = nextState;
}

function sendMessage(message) {
	var jsonMessage = JSON.stringify(message);
	console.log('Sending message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function showSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].poster = './img/transparent-1px.png';
		arguments[i].style.background = 'center transparent url("./img/spinner.gif") no-repeat';
	}
}

function hideSpinner() {
	for (var i = 0; i < arguments.length; i++) {
		arguments[i].src = '';
		arguments[i].poster = './img/webrtc.png';
		arguments[i].style.background = '';
	}
}

/**
 * Lightbox utility (to display media pipeline image in a modal dialog)
 */
$(document).delegate('*[data-toggle="lightbox"]', 'click', function(event) {
	event.preventDefault();
	$(this).ekkoLightbox();
});




// 여기다가 감독이 이름을 입력하면, 감독을 인식하는 로직을 작성할 것이다!!
function directorRecognize() {
	// 감독의 이름을 받고, 저장해둔다.
	console.log("director recognizing...")
	var name = document.getElementById('directorName').value;
	if (director_db.includes(name)) {
		window.alert("잘못된 감독자 이름입니다. 관리자에게 문의하십시오.");
		return;
	}else{
		console.log("welcome 감독관님.")
		director = name;
	}
	var message = {
		id : 'directorName',
		name : name
	};
	sendMessage(message);
	start();
	
}

function studentRecognize() {
	// 학생의 이름을 받고, 저장해둔다.
	console.log("학생 recognizing...")
	var name = document.getElementById('studentName').value;
	var room = document.getElementById('roomName').value;


	console.log("welcome 학생 ${name}.")
	student = name;
	
	var message = {
		id : 'studentName',
		name : name
	};
	sendMessage(message);
	start();
	
}