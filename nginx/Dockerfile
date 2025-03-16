FROM nginx:alpine

RUN rm /etc/nginx/conf.d/*

RUN ls -la

COPY ./nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

EXPOSE 443

CMD [ "nginx", "-g", "daemon off;" ]
