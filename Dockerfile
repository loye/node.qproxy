FROM node
MAINTAINER Loye <loye.qiu@gmail.com>

RUN npm install pm2 -g \
	&& npm install
	
EXPOSE 1443

CMD ["pm2-docker", "start", "server-full.js", "--name", "proxy"]
