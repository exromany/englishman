FROM node:7.9-slim

RUN echo Europe/Samara | tee /etc/timezone; \
    dpkg-reconfigure --frontend noninteractive tzdata

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock /usr/src/app/
RUN yarn install && yarn cache clean

# Bundle app source
COPY . /usr/src/app

CMD [ "npm", "start" ]
