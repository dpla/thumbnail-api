# What is this?
It's a service written in Typescript/Node that takes a DPLA item ID and returns a thumbnail of the image in question, if one is available. 

Sources can be our cache in S3, or the upstream contributing institution's thumbnail url. There are a lot of edge cases to handle if the upstream version isn't an image, or the server is down, or it doesn't exist, or it takes too long to load, or...
