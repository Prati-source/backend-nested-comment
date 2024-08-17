FROM node:20
WORKDIR /
COPY package*.json ./
COPY . ./
RUN npm install
EXPOSE 3500
CMD ["node", "api/index.js"]
