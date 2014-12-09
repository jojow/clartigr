# clartigr

## Run

There are three option to run the API implementation:



### 1. Run directly

You need to have Node.js installed to run:

    npm run prepare-runtime
    npm start



### 2. Run in Docker container

You need to have Docker installed to run:

    docker build -t clartigr .
    docker run -d -p 3000:3000 clartigr



### 3. Run using Vagrant

You need to have Vagrant installed to run:

    vagrant up



## Access

The endpoint(s) to access the API are:

    http://{HOST}:3000


If you run the API implementatio locally, `{HOST}` is most probably `localhost`.
