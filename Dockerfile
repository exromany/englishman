FROM node:7.4.0-onbuild

RUN echo Europe/Samara | tee /etc/timezone; \
    dpkg-reconfigure --frontend noninteractive tzdata
