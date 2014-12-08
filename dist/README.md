# clartigr

Clone this repository and run:

    cd dist



## Run directly

You need to have Node.js >= 0.10 installed to run:

    npm run prepare-runtime
    npm start



## Run in Docker container

You need to have Docker installed to run:

    docker build -t clartigr .
    docker run -d -p 3000:3000 clartigr



## Run using Vagrant

You need to have Vagrant installed to run:

    vagrant up
