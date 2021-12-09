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

var ws = new WebSocket("wss://" + location.host + "/websocket");
var director = {
  studentsConnection: {},
  camsConnection: {},
};
var chatText;
var chatBox;
var group;
var globaluserlist = {};

//여기에다가 초기세팅들, 이벤트핸들러들을 핸들한다.
window.onload = function () {
  // setRegisterState(NOT_REGISTERED);

  chatText = document.getElementById("chatText");
  chatBox = document.getElementById("chatBox");
  group = document.getElementById("toSelect");
  chatGroup = document.getElementById("chatGroup");
  //방입장버튼을 누르면, 등록한다.
  document
    .getElementById("directorJoin")
    .addEventListener("click", function () {
      register();
    });
  // 채팅창 온오프
  document.getElementById("disableChat").addEventListener("click", function () {
    if (chatGroup.style.display === "none") {
      chatGroup.style.display = "inline-block";
    } else {
      chatGroup.style.display = "none";
    }
  });
  //종료버튼을 누르면 시험을 종료한다.
  document
    .getElementById("directorTerminate")
    .addEventListener("click", function () {
      stop();
    });

  document.getElementById("sendChat").addEventListener("click", function () {
    sendChatMessage();
  });

  chatText.addEventListener("keyup", function (event) {
    if (event.code === "Enter") {
      sendChatMessage();
    }
  });

  systemAddMessageToChatbox(
    "충남대학교 시험감독 프로그램에 오신 것을 환영합니다. 감독관 이름과 방이름을 입력한 후 다른 학생들과 감독관들에게 방이름을 알려주세요."
  );
  systemAddMessageToChatbox("영상을 클릭하면 확대/축소가 가능합니다.");
  systemAddMessageToChatbox(
    "방에 입장한 후엔 채팅기능을 이용하실 수 있으며, 화면의 이름을 클릭하면 바로 귓속말을 보낼 수 있습니다."
  );
};

window.onbeforeunload = function () {
  ws.close();
};

// 자기자신의 정보를 이 페이지에 세팅해두고, 서버에 식별용으로 알려준다.
function register() {
  var directorName = document.getElementById("directorName").value;
  if (directorName == "") {
    window.alert("감독관 이름이 비어있습니다. 반드시 써주셔야 합니다.");
    return;
  }

  var roomName = document.getElementById("roomName").value;
  if (roomName == "") {
    window.alert("방 이름이 비어있습니다. 반드시 써주셔야 합니다.");
    return;
  }

  director.name = directorName;
  director.room = roomName;
  director.studentsConnection = {};
  director.camsConnection = {};

  var message = {
    id: "directorJoinRoom",
    directorName: directorName,
    roomName: roomName,
    password: document.getElementById("admin_password").value,
  };
  sendMessage(message);
  systemAddMessageToChatbox(
    "관리자" + director.name + "님이 " + director.room + " 에 접속합니다."
  );
  console.info(
    "관리자" + director.name + "님이 " + director.room + " 에 접속시도합니다."
  );
}

ws.onmessage = function (message) {
  var parsedMessage = JSON.parse(message.data);
  console.info("Received message: " + message.data);
  switch (parsedMessage.id) {
    case "sameNameError":
      systemAddMessageToChatbox(
        "이미 존재하는 이름입니다. 다른이름을 선택해 주세요"
      );
      console.log("이미 존재하는 이름입니다. 다른이름을 선택해 주세요");
      delete director.name;
      delete director.room;
      break;
    case "sessionError":
      systemAddMessageToChatbox(
        "새로고침해 재접속한 후 다시 진행 부탁드립니다."
      );
      console.log(parsedMessage.message);
      break;
    case "shouldConnect":
      console.log(parsedMessage.message);
      startCall(parsedMessage.studentName, parsedMessage.roomName);
      break;
    case "camShouldConnect":
      console.log(parsedMessage.message);
      camStartCall(parsedMessage.camName, parsedMessage.roomName);
      break;
    case "iceCandidate":
      console.log(parsedMessage.message);
      director.studentsConnection[
        parsedMessage.studentName
      ].peer.addIceCandidate(parsedMessage.candidate);
      break;
    case "camIceCandidate":
      console.log(parsedMessage.message);
      director.camsConnection[parsedMessage.camName].peer.addIceCandidate(
        parsedMessage.candidate
      );
      break;
    case "serverToDirectorSdpAnswer":
      director.studentsConnection[parsedMessage.studentName].peer.processAnswer(
        parsedMessage.sdpAnswer
      );
      break;
    case "camServerToDirectorSdpAnswer":
      director.camsConnection[parsedMessage.camName].peer.processAnswer(
        parsedMessage.sdpAnswer
      );
      break;
    case "studentStopped":
      studentStop(parsedMessage.studentName);
      break;
    case "camStopped":
      camStop(parsedMessage.camName);
      break;
    case "sendChat":
      addMessageToChatbox(parsedMessage.from, parsedMessage.text);
      break;
    case "roominfo":
      // document.getElementById("roomBox").innerHTML = message.data
      break;
    case "passwordError":
      systemAddMessageToChatbox("잘못된 패스워드입니다.다시 확인해 주세요.");
      console.log(parsedMessage.message);
      break;

    default:
      console.error("Unrecognized message", parsedMessage);
  }
};

function startCall(studentName, roomName) {
  systemAddMessageToChatbox(studentName + "님이 화면공유를 시도합니다.");
  console.log("webrtcpeer 생성을 시작합니다");
  console.log(roomName);
  //화면캡처
  my_student_element = null;
  if (document.getElementById(studentName)) {
    my_student_element = document.getElementById(studentName);
  } else {
    my_student_element = document.createElement("div");
    my_student_element.setAttribute("id", studentName);
    my_student_element.setAttribute("style", "display:inline-block");
    my_student_element.setAttribute("class", "col card");
    let my_label = document.createElement("div");
    my_label.setAttribute("class", "card-header");
    my_label.innerHTML = studentName;
    my_student_element.appendChild(my_label);
    my_label.addEventListener("click", function () {
      document.getElementById("toSelect").selectedIndex = 2;
      document.getElementById("toSpecific").style.display = "inline-block";
      document.getElementById("toSpecific").value = my_label.innerHTML;
    });
    document.getElementById("videoLists").appendChild(my_student_element);
  }
  if (studentName in globaluserlist) {
    globaluserlist[studentName].screen = "On";
  } else {
    console.log("reached here");
    globaluserlist[studentName] = { screen: " ", cam: " " };
    globaluserlist[studentName].screen = "On";
  }
  my_element = document.createElement("video");
  my_element.setAttribute("id", studentName + "screen!");
  // my_element.setAttribute("width","240px");
  // my_element.setAttribute("height","180px");
  my_element.setAttribute("autoplay", true);
  my_element.setAttribute("muted", true);
  my_element.setAttribute("playsinline", true);
  my_element.setAttribute("style", "display: inline");

  let reso_message = {
    id: "changeScreenResolution",
    studentName: studentName,
    roomName: roomName,
  };

  my_student_element.appendChild(my_element);

  my_element.addEventListener("click", function () {
    console.log(studentName);
    sendMessage(reso_message);
  });
  //현재옵션:
  //스트림 = 화면
  //로컬스트림 출력 세팅
  my_configuration = {
    iceServers: [
      {
        urls: "turn:turn.cnuclassroom.shop",
        username: "kurento",
        credential: "kurento",
      },
    ],
  };

  options = {
    remoteVideo: document.getElementById(studentName + "screen!"),
    configuration: my_configuration,
    onicecandidate: function (candidate) {
      console.log("hi");
      console.log("이 컴퓨터의 candidate: " + JSON.stringify(candidate));
      //이 onicecandidate는 식별될 필요가있음
      //이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
      var message = {
        id: "directorOnIceCandidate",
        directorName: director.name,
        studentName: studentName,
        candidate: candidate,
      };
      sendMessage(message);
    },
  };

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(
    options,
    function (error) {
      if (error) return onError(error);
      // i'll work with my peerconnection

      //create my offer
      console.log("director측 offerSdp 생성하겠습니다.");
      this.generateOffer((error, offerSdp) => {
        var message = {
          id: "directorOffer",
          directorName: director.name,
          studentName: studentName,
          roomName: director.room,
          sdpOffer: offerSdp,
        };
        sendMessage(message);
      });
      director.studentsConnection[studentName] = {};
      director.studentsConnection[studentName].peer = this;
      console.log("reached directorStartCall end");
    }
  );

  //TODO
}

function camStartCall(camName, roomName) {
  systemAddMessageToChatbox(camName + "님이 카메라 공유를 시도합니다.");
  console.log("webrtcpeer 생성을 시작합니다");
  //화면캡처
  my_student_element = null;
  if (document.getElementById(camName)) {
    my_student_element = document.getElementById(camName);
  } else {
    my_student_element = document.createElement("div");
    my_student_element.setAttribute("id", camName);
    my_student_element.setAttribute("class", "col card");
    my_student_element.setAttribute("style", "display:inline-block");
    let my_label = document.createElement("div");
    my_label.innerHTML = camName;
    my_label.setAttribute("class", "card-header");
    my_student_element.appendChild(my_label);
    my_label.addEventListener("click", function () {
      document.getElementById("toSelect").selectedIndex = 2;
      document.getElementById("toSpecific").style.display = "inline-block";
      document.getElementById("toSpecific").value = my_label.innerHTML;
    });
    document.getElementById("videoLists").appendChild(my_student_element);
  }
  if (camName in globaluserlist) {
    globaluserlist[camName].cam = "On";
  } else {
    console.log("reached cam here");
    globaluserlist[camName] = { screen: " ", cam: " " };
    globaluserlist[camName].cam = "On";
  }
  my_element = document.createElement("video");
  my_element.setAttribute("style", "display: inline");
  my_element.setAttribute("id", camName + "cam!");
  // my_element.setAttribute("width","240px");
  // my_element.setAttribute("height","180px");
  my_element.setAttribute("autoplay", true);
  my_element.setAttribute("muted", true);
  my_element.setAttribute("playsinline", true);
  let reso_message = {
    id: "changeCamResolution",
    camName: camName,
    roomName: roomName,
  };

  my_student_element.appendChild(my_element);

  my_element.addEventListener("click", function () {
    sendMessage(reso_message);
  });
  //현재옵션:
  //스트림 = 화면
  //로컬스트림 출력 세팅
  my_configuration = {
    iceServers: [
      {
        urls: "turn:turn.cnuclassroom.shop",
        username: "kurento",
        credential: "kurento",
      },
    ],
  };
  options = {
    remoteVideo: document.getElementById(camName + "cam!"),
    configuration: my_configuration,
    onicecandidate: function (candidate) {
      console.log("hi");
      console.log("이 컴퓨터의 candidate: " + JSON.stringify(candidate));
      //이 onicecandidate는 식별될 필요가있음
      //이친구가 식별할건 아니고, 아마 server.js가 해야될텐데...
      var message = {
        id: "camDirectorOnIceCandidate",
        directorName: director.name,
        camName: camName,
        candidate: candidate,
      };
      sendMessage(message);
    },
  };

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(
    options,
    function (error) {
      if (error) return onError(error);
      // i'll work with my peerconnection

      //create my offer
      console.log("director측 offerSdp 생성하겠습니다.");
      this.generateOffer((error, offerSdp) => {
        var message = {
          id: "camDirectorOffer",
          directorName: director.name,
          camName: camName,
          roomName: director.room,
          sdpOffer: offerSdp,
        };
        sendMessage(message);
      });
      director.camsConnection[camName] = {};
      director.camsConnection[camName].peer = this;
      console.log("reached directorStartCall end");
    }
  );

  //TODO
}

function stop() {
  systemAddMessageToChatbox("접속을 종료합니다.");
  for (key in director.studentsConnection) {
    if (director.studentsConnection[key].peer) {
      director.studentsConnection[key].peer.dispose();
    }
    if (document.getElementById(key + "screen!")) {
      document.getElementById(key + "screen!").remove();
    }
    if (!document.getElementById(key + "cam!")) {
      console.log("div delete!");
      document.getElementById(key).remove();
    }
    delete director.studentsConnection[key];
  }
  for (key in director.camsConnection) {
    if (director.camsConnection[key].peer) {
      director.camsConnection[key].peer.dispose();
    }
    if (document.getElementById(key + "cam!")) {
      document.getElementById(key + "cam!").remove();
    }
    if (!document.getElementById(key + "screen!")) {
      console.log("div delete!");
      document.getElementById(key).remove();
    }
    delete director.camsConnection[key];
  }
  var message = {
    id: "adminStop",
  };
  sendMessage(message);
  director = {
    studentsConnection: {},
    camsConnection: {},
  };
  globaluserlist = {};
}

function studentStop(studentName) {
  systemAddMessageToChatbox(studentName + "님이 화면공유를 종료합니다.");
  console.log(studentName + "학생이 화면 공유를 끄셨습니다");
  if (studentName in globaluserlist) {
    globaluserlist[studentName].screen = " ";
  }
  if (director.studentsConnection[studentName]) {
    delete director.studentsConnection[studentName];
  }
  if (document.getElementById(studentName + "screen!")) {
    console.log("remove screen!");
    document.getElementById(studentName + "screen!").remove();
  }
  if (!document.getElementById(studentName + "cam!")) {
    console.log("div delete!");
    document.getElementById(studentName).remove();
    delete globaluserlist[studentName];
  }
}

function camStop(camName) {
  systemAddMessageToChatbox(camName + "님이 카메라 공유를 종료합니다.");
  console.log(camName + "학생이 캠 공유를 끄셨습니다");
  if (camName in globaluserlist) {
    globaluserlist[camName].screen = " ";
  }
  if (director.camsConnection[camName]) {
    delete director.camsConnection[camName];
  }
  if (document.getElementById(camName + "cam!")) {
    console.log("remove cam!");
    document.getElementById(camName + "cam!").remove();
  }
  if (!document.getElementById(camName + "screen!")) {
    console.log("div delete!");
    document.getElementById(camName).remove();
    delete globaluserlist[camName];
  }
}

//아무거나 쓰면 json stringify로 보내줌.
function sendMessage(message) {
  var jsonMessage = JSON.stringify(message);
  console.log("Director 가 앱서버에 메시지 보내는중: " + jsonMessage);
  ws.send(jsonMessage);
}

function sendChatMessage() {
  console.log("sending 채팅 message");
  if (!director.name) {
    systemAddMessageToChatbox(
      "유저가 제대로 등록되지 않았습니다.채팅이 불가능합니다."
    );
    console.log("등록되지 않은 학생은 사용불가");
    return;
  }
  //웹소켓으로 메시지를 보낸다.
  to = group.value;
  toto = "";
  if (to == "specific") {
    toto = document.getElementById("toSpecific").value;
  } else {
    toto = to;
  }
  message = {
    id: "sendChat",
    from: director.name,
    room: director.room,
    text: chatText.value,
    to: toto,
  };
  // addMessageToChatbox(message.from,message.text,"red")
  sendMessage(message);
  if (to == "specific") {
    addMessageToChatbox(toto + "에게 귓속말", message.text, "grey");
  } else {
    addMessageToChatbox(message.from, message.text, "blue");
  }
  //비운다.
  chatText.value = "";
}

function addMessageToChatbox(name, message, color = "black") {
  if (message == "") {
    return;
  }
  console.log("리시빙~");
  var now = new Date();
  chatBox.innerHTML = `${
    chatBox.innerHTML
  } <span style='color:${color}'> ${name}: ${message} - ${now.getHours()}시 ${now.getMinutes()}분 <br></span>`;
  // chatBox.innerHTML =chatBox.innerHTML+ "<span style='color:red'>"+name +": "+ message + "- " + now.getHours() + "시" + now.getMinutes() + "분<br></span>"
}

function systemAddMessageToChatbox(message) {
  addMessageToChatbox("프로그램", message, "green");
}

function specificSelected(that) {
  if (that.value == "specific") {
    document.getElementById("toSpecific").style.display = "inline-block";
  } else {
    document.getElementById("toSpecific").style.display = "none";
  }
}

const e = React.createElement;

class StudentList extends React.Component {
  constructor(props) {
    super(props);
    this.state = { userlist: [] };
  }

  render() {
    if (this.state.userlist.length === 0) {
      return (
        <React.Fragment>
          <button onClick={() => this.setState({ userlist: globaluserlist })}>
            버튼을 눌러 출석 학생 리스트 새로고침
          </button>
          <p>현재 학생수 : 0</p>
        </React.Fragment>
      );
    }
    listItems = Object.keys(this.state.userlist).map((username) => (
      <tr key={username}>
        <td>{username}</td>
        <td>{this.state.userlist[username].screen}</td>
        <td>{this.state.userlist[username].cam}</td>
      </tr>
    ));

    const usercounter = Object.keys(this.state.userlist).length;
    return (
      <React.Fragment>
        <button
          className="btn btn-secondary"
          onClick={() => this.setState({ userlist: globaluserlist })}
        >
          버튼을 눌러 출석 학생 리스트 새로고침
        </button>
        <h4>
          현재 학생수 : <span className="badge bg-primary">{usercounter}</span>
        </h4>
        <table className="table table-striped table-hover table-bordered">
          <tr className="thead-dark">
            <th>학생이름</th>
            <th>화면공유</th>
            <th>카메라공유</th>
          </tr>
          {listItems}
        </table>
      </React.Fragment>
    );
  }
}

class StudentListFrame extends React.Component {
  constructor(props) {
    super(props);
  }
  render() {}
}

const domContainer = document.querySelector("#user_list_container");
ReactDOM.render(e(StudentList), domContainer);
