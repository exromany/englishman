FROM node:7.9-onbuild

# Set timezone
RUN echo Europe/Samara | tee /etc/timezone; \
    dpkg-reconfigure --frontend noninteractive tzdata
