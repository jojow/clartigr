FROM node:0.10

RUN apt-get -y update && apt-get -y install sudo 

RUN npm install forever -g

ADD . /impl/
WORKDIR /impl
RUN npm run prepare-runtime


EXPOSE 3000


#CMD npm start
CMD forever -c "npm start" -l ./forever.log -o ./out.log -e ./err.log .
