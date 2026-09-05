import swaggerJSDoc from "swagger-jsdoc";

const swaggerSpec = swaggerJSDoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Siri Backend API",
      version: "1.0.0",
      description: "API documentation for the Siri backend",
    },
    servers: [{ url: "http://localhost:3000" }],
  },
  apis: ["./src/modules/**/*.ts", "./dist/modules/**/*.js"],
});

export default swaggerSpec;
