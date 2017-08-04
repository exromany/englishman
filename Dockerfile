FROM node:8.2-onbuild

# Set timezone
RUN echo Europe/Samara | tee /etc/timezone; \
    dpkg-reconfigure --frontend noninteractive tzdata
