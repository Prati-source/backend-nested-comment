FROM node:20
WORKDIR /api
COPY package*.json ./
RUN npm start
COPY . ./
EXPOSE 3500
CMD ["node", "index.js"]
