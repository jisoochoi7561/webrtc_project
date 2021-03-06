var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

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
  camsConnection: {}
};
var chatText;
var chatBox;
var group;
var globaluserlist = {};

//??????????????? ???????????????, ???????????????????????? ????????????.
window.onload = function () {
  // setRegisterState(NOT_REGISTERED);

  chatText = document.getElementById("chatText");
  chatBox = document.getElementById("chatBox");
  group = document.getElementById("toSelect");
  chatGroup = document.getElementById("chatGroup");
  //?????????????????? ?????????, ????????????.
  document.getElementById("directorJoin").addEventListener("click", function () {
    register();
  });
  // ????????? ?????????
  document.getElementById("disableChat").addEventListener("click", function () {
    if (chatGroup.style.display === "none") {
      chatGroup.style.display = "inline-block";
    } else {
      chatGroup.style.display = "none";
    }
  });
  //??????????????? ????????? ????????? ????????????.
  document.getElementById("directorTerminate").addEventListener("click", function () {
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

  systemAddMessageToChatbox("??????????????? ???????????? ??????????????? ?????? ?????? ???????????????. ????????? ????????? ???????????? ????????? ??? ?????? ???????????? ?????????????????? ???????????? ???????????????.");
  systemAddMessageToChatbox("????????? ???????????? ??????/????????? ???????????????.");
  systemAddMessageToChatbox("?????? ????????? ?????? ??????????????? ???????????? ??? ?????????, ????????? ????????? ???????????? ?????? ???????????? ?????? ??? ????????????.");
};

window.onbeforeunload = function () {
  ws.close();
};

// ??????????????? ????????? ??? ???????????? ???????????????, ????????? ??????????????? ????????????.
function register() {
  var directorName = document.getElementById("directorName").value;
  if (directorName == "") {
    window.alert("????????? ????????? ??????????????????. ????????? ???????????? ?????????.");
    return;
  }

  var roomName = document.getElementById("roomName").value;
  if (roomName == "") {
    window.alert("??? ????????? ??????????????????. ????????? ???????????? ?????????.");
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
    password: document.getElementById("admin_password").value
  };
  sendMessage(message);
  systemAddMessageToChatbox("?????????" + director.name + "?????? " + director.room + " ??? ???????????????.");
  console.info("?????????" + director.name + "?????? " + director.room + " ??? ?????????????????????.");
}

ws.onmessage = function (message) {
  var parsedMessage = JSON.parse(message.data);
  console.info("Received message: " + message.data);
  switch (parsedMessage.id) {
    case "sameNameError":
      systemAddMessageToChatbox("?????? ???????????? ???????????????. ??????????????? ????????? ?????????");
      console.log("?????? ???????????? ???????????????. ??????????????? ????????? ?????????");
      delete director.name;
      delete director.room;
      break;
    case "sessionError":
      systemAddMessageToChatbox("??????????????? ???????????? ??? ?????? ?????? ??????????????????.");
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
      director.studentsConnection[parsedMessage.studentName].peer.addIceCandidate(parsedMessage.candidate);
      break;
    case "camIceCandidate":
      console.log(parsedMessage.message);
      director.camsConnection[parsedMessage.camName].peer.addIceCandidate(parsedMessage.candidate);
      break;
    case "serverToDirectorSdpAnswer":
      director.studentsConnection[parsedMessage.studentName].peer.processAnswer(parsedMessage.sdpAnswer);
      break;
    case "camServerToDirectorSdpAnswer":
      director.camsConnection[parsedMessage.camName].peer.processAnswer(parsedMessage.sdpAnswer);
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
      systemAddMessageToChatbox("????????? ?????????????????????.?????? ????????? ?????????.");
      console.log(parsedMessage.message);
      break;

    default:
      console.error("Unrecognized message", parsedMessage);
  }
};

function startCall(studentName, roomName) {
  systemAddMessageToChatbox(studentName + "?????? ??????????????? ???????????????.");
  console.log("webrtcpeer ????????? ???????????????");
  console.log(roomName);
  //????????????
  my_student_element = null;
  if (document.getElementById(studentName)) {
    my_student_element = document.getElementById(studentName);
  } else {
    my_student_element = document.createElement("div");
    my_student_element.setAttribute("id", studentName);
    my_student_element.setAttribute("style", "display:inline-block");
    my_student_element.setAttribute("class", "col card");
    var my_label = document.createElement("div");
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

  var reso_message = {
    id: "changeScreenResolution",
    studentName: studentName,
    roomName: roomName
  };

  my_student_element.appendChild(my_element);

  my_element.addEventListener("click", function () {
    console.log(studentName);
    sendMessage(reso_message);
  });
  //????????????:
  //????????? = ??????
  //??????????????? ?????? ??????
  my_configuration = {
    iceServers: [{
      urls: "turn:turn.cnuclassroom.shop",
      username: "kurento",
      credential: "kurento"
    }]
  };

  options = {
    remoteVideo: document.getElementById(studentName + "screen!"),
    configuration: my_configuration,
    onicecandidate: function onicecandidate(candidate) {
      console.log("hi");
      console.log("??? ???????????? candidate: " + JSON.stringify(candidate));
      //??? onicecandidate??? ????????? ???????????????
      //???????????? ???????????? ?????????, ?????? server.js??? ???????????????...
      var message = {
        id: "directorOnIceCandidate",
        directorName: director.name,
        studentName: studentName,
        candidate: candidate
      };
      sendMessage(message);
    }
  };

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function (error) {
    if (error) return onError(error);
    // i'll work with my peerconnection

    //create my offer
    console.log("director??? offerSdp ?????????????????????.");
    this.generateOffer(function (error, offerSdp) {
      var message = {
        id: "directorOffer",
        directorName: director.name,
        studentName: studentName,
        roomName: director.room,
        sdpOffer: offerSdp
      };
      sendMessage(message);
    });
    director.studentsConnection[studentName] = {};
    director.studentsConnection[studentName].peer = this;
    console.log("reached directorStartCall end");
  });

  //TODO
}

function camStartCall(camName, roomName) {
  systemAddMessageToChatbox(camName + "?????? ????????? ????????? ???????????????.");
  console.log("webrtcpeer ????????? ???????????????");
  //????????????
  my_student_element = null;
  if (document.getElementById(camName)) {
    my_student_element = document.getElementById(camName);
  } else {
    my_student_element = document.createElement("div");
    my_student_element.setAttribute("id", camName);
    my_student_element.setAttribute("class", "col card");
    my_student_element.setAttribute("style", "display:inline-block");
    var my_label = document.createElement("div");
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
  var reso_message = {
    id: "changeCamResolution",
    camName: camName,
    roomName: roomName
  };

  my_student_element.appendChild(my_element);

  my_element.addEventListener("click", function () {
    sendMessage(reso_message);
  });
  //????????????:
  //????????? = ??????
  //??????????????? ?????? ??????
  my_configuration = {
    iceServers: [{
      urls: "turn:turn.cnuclassroom.shop",
      username: "kurento",
      credential: "kurento"
    }]
  };
  options = {
    remoteVideo: document.getElementById(camName + "cam!"),
    configuration: my_configuration,
    onicecandidate: function onicecandidate(candidate) {
      console.log("hi");
      console.log("??? ???????????? candidate: " + JSON.stringify(candidate));
      //??? onicecandidate??? ????????? ???????????????
      //???????????? ???????????? ?????????, ?????? server.js??? ???????????????...
      var message = {
        id: "camDirectorOnIceCandidate",
        directorName: director.name,
        camName: camName,
        candidate: candidate
      };
      sendMessage(message);
    }
  };

  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function (error) {
    if (error) return onError(error);
    // i'll work with my peerconnection

    //create my offer
    console.log("director??? offerSdp ?????????????????????.");
    this.generateOffer(function (error, offerSdp) {
      var message = {
        id: "camDirectorOffer",
        directorName: director.name,
        camName: camName,
        roomName: director.room,
        sdpOffer: offerSdp
      };
      sendMessage(message);
    });
    director.camsConnection[camName] = {};
    director.camsConnection[camName].peer = this;
    console.log("reached directorStartCall end");
  });

  //TODO
}

function stop() {
  systemAddMessageToChatbox("????????? ???????????????.");
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
    id: "adminStop"
  };
  sendMessage(message);
  director = {
    studentsConnection: {},
    camsConnection: {}
  };
  globaluserlist = {};
}

function studentStop(studentName) {
  systemAddMessageToChatbox(studentName + "?????? ??????????????? ???????????????.");
  console.log(studentName + "????????? ?????? ????????? ???????????????");
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
  systemAddMessageToChatbox(camName + "?????? ????????? ????????? ???????????????.");
  console.log(camName + "????????? ??? ????????? ???????????????");
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

//???????????? ?????? json stringify??? ?????????.
function sendMessage(message) {
  var jsonMessage = JSON.stringify(message);
  console.log("Director ??? ???????????? ????????? ????????????: " + jsonMessage);
  ws.send(jsonMessage);
}

function sendChatMessage() {
  console.log("sending ?????? message");
  if (!director.name) {
    systemAddMessageToChatbox("????????? ????????? ???????????? ???????????????.????????? ??????????????????.");
    console.log("???????????? ?????? ????????? ????????????");
    return;
  }
  //??????????????? ???????????? ?????????.
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
    to: toto
  };
  // addMessageToChatbox(message.from,message.text,"red")
  sendMessage(message);
  if (to == "specific") {
    addMessageToChatbox(toto + "?????? ?????????", message.text, "grey");
  } else {
    addMessageToChatbox(message.from, message.text, "blue");
  }
  //?????????.
  chatText.value = "";
}

function addMessageToChatbox(name, message) {
  var color = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : "black";

  if (message == "") {
    return;
  }
  console.log("?????????~");
  var now = new Date();
  chatBox.innerHTML = chatBox.innerHTML + " <span style='color:" + color + "'> " + name + ": " + message + " - " + now.getHours() + "\uC2DC " + now.getMinutes() + "\uBD84 <br></span>";
  // chatBox.innerHTML =chatBox.innerHTML+ "<span style='color:red'>"+name +": "+ message + "- " + now.getHours() + "???" + now.getMinutes() + "???<br></span>"
}

function systemAddMessageToChatbox(message) {
  addMessageToChatbox("????????????", message, "green");
}

function specificSelected(that) {
  if (that.value == "specific") {
    document.getElementById("toSpecific").style.display = "inline-block";
  } else {
    document.getElementById("toSpecific").style.display = "none";
  }
}

var e = React.createElement;

var StudentList = function (_React$Component) {
  _inherits(StudentList, _React$Component);

  function StudentList(props) {
    _classCallCheck(this, StudentList);

    var _this = _possibleConstructorReturn(this, (StudentList.__proto__ || Object.getPrototypeOf(StudentList)).call(this, props));

    _this.state = { userlist: [] };
    return _this;
  }

  _createClass(StudentList, [{
    key: "render",
    value: function render() {
      var _this2 = this;

      if (this.state.userlist.length === 0) {
        return React.createElement(
          React.Fragment,
          null,
          React.createElement(
            "button",
            { onClick: function onClick() {
                return _this2.setState({ userlist: globaluserlist });
              } },
            "\uBC84\uD2BC\uC744 \uB20C\uB7EC \uCD9C\uC11D \uD559\uC0DD \uB9AC\uC2A4\uD2B8 \uC0C8\uB85C\uACE0\uCE68"
          ),
          React.createElement(
            "p",
            null,
            "\uD604\uC7AC \uD559\uC0DD\uC218 : 0"
          )
        );
      }
      listItems = Object.keys(this.state.userlist).map(function (username) {
        return React.createElement(
          "tr",
          { key: username },
          React.createElement(
            "td",
            null,
            username
          ),
          React.createElement(
            "td",
            null,
            _this2.state.userlist[username].screen
          ),
          React.createElement(
            "td",
            null,
            _this2.state.userlist[username].cam
          )
        );
      });

      var usercounter = Object.keys(this.state.userlist).length;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          "button",
          { onClick: function onClick() {
              return _this2.setState({ userlist: globaluserlist });
            } },
          "\uBC84\uD2BC\uC744 \uB20C\uB7EC \uCD9C\uC11D \uD559\uC0DD \uB9AC\uC2A4\uD2B8 \uC0C8\uB85C\uACE0\uCE68"
        ),
        React.createElement(
          "h4",
          null,
          "\uD604\uC7AC \uD559\uC0DD\uC218 : ",
          React.createElement(
            "span",
            { className: "badge bg-primary" },
            usercounter
          )
        ),
        React.createElement(
          "table",
          { className: "table table-striped table-hover table-bordered" },
          React.createElement(
            "tr",
            { className: "thead-dark" },
            React.createElement(
              "th",
              null,
              "\uD559\uC0DD\uC774\uB984"
            ),
            React.createElement(
              "th",
              null,
              "\uD654\uBA74\uACF5\uC720"
            ),
            React.createElement(
              "th",
              null,
              "\uCE74\uBA54\uB77C\uACF5\uC720"
            )
          ),
          listItems
        )
      );
    }
  }]);

  return StudentList;
}(React.Component);

var StudentListFrame = function (_React$Component2) {
  _inherits(StudentListFrame, _React$Component2);

  function StudentListFrame(props) {
    _classCallCheck(this, StudentListFrame);

    return _possibleConstructorReturn(this, (StudentListFrame.__proto__ || Object.getPrototypeOf(StudentListFrame)).call(this, props));
  }

  _createClass(StudentListFrame, [{
    key: "render",
    value: function render() {}
  }]);

  return StudentListFrame;
}(React.Component);

var domContainer = document.querySelector("#user_list_container");
ReactDOM.render(e(StudentList), domContainer);