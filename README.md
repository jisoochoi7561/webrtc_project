# READEME

## how to install


``` bash
git clone https://github.com/jisoochoi7561/webrtc_project.git # clone project
sudo docker-compose up # run kurento server
cd my_project # project folder
node server.js # run application
```    
## ports
- 80 : http port. redirect to 443 by Nginx
- 443: https port & main port. should be opened.
- 8443: node app server port. should be closed.
- 8888: kurento media server port. 
- 3478 & 5349: koturn server port. Both TCP and UDP should be opened. you can use other TURN server then change some codes.

If you're new to this project, you should change All IP addresses in nginx with yours.

Your domain and SSL certificates should be set properly too.
## nginx conf
``` 
user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events{
	worker_connections 768; 
}
http{
	sendfile on;
	include /etc/nginx/mime.types;
        default_type application/octet-stream;
	map $http_upgrade $connection_upgrade{  ## websocket upgrade
		default upgrade;
		'' close;
}
	upstream websocket{
		server 168.188.129.207:8443;  ## node app server
}
	server{
		listen 443 ssl; ## public port

		ssl_certificate /etc/letsencrypt/live/jisoochoi.shop/fullchain.pem;   ## SSL certificates
		ssl_certificate_key /etc/letsencrypt/live/jisoochoi.shop/privkey.pem;
		ssl_prefer_server_ciphers on;
		ssl_protocols TLSv1.2 TLSv1.3;
		location /websocket {   ## websocket upgrade
			proxy_pass http://websocket;  
			proxy_http_version 1.1;
			proxy_set_header Upgrade $http_upgrade;
			proxy_set_header Connection $connection_upgrade;
			proxy_set_header Host $host;
			proxy_read_timeout 36000s;
			proxy_send_timeout 36000s;
}
		location / {
                        root /home/jisoo/webrtc_project/my_project/static;  ## serve static folder
}
}
	server{  
		listen 80;  ## redirect 80 to 443
		server_name jisoochoi.shop;
		return 301 https://jisoochoi.shop$request_uri;		

}

}

```

## Docker-compose
```
version: "3.7"

services:

        kurento:
                container_name: kurento
                image: "kurento/kurento-media-server:latest"
                network_mode: "host"
                volumes:
                  - type: bind
                    source: ./etc-kurento
                    target: /etc/kurento
                  - type: bind
                    source: ./tmp
                    target: /tmp



# revise WebRtcEndpoint.conf inside ./etc-kurento and bind to /etc/kurento
# bind folder to /tmp for recorded files
```

## Debug
This project is based on KURENTO, so might have performance issues.

If you face one, upgrade your CPU or lower Framerates.

You might consider use another media server or pure WebRTC