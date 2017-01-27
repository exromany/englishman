FROM node:7.4.0-onbuild

ENV TZ=Europe/Samara
RUN echo $TZ | tee /etc/timezone
RUN dpkg-reconfigure --frontend noninteractive tzdata
