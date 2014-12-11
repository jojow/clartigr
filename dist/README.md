# clartigr

Cloud Artifact & Instance Manager



## Run

There are three option to run clartigr:



### A. Run directly

You need to have Node.js installed to run:

    npm run prepare-runtime
    npm start



### B. Run in Docker container

You need to have Docker installed to run:

    docker build -t clartigr .
    docker run -d -p 3000:3000 clartigr



### C. Run using Vagrant

You need to have Vagrant installed to run:

    vagrant up



## Access

Use the following endpoint(s) to access the API:

    http://{HOST}:3000

If you run the API implementation locally, `{HOST}` is most probably `localhost`.
