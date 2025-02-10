FROM maven:3.9.4-eclipse-temurin-21 AS builder

WORKDIR /app

COPY pom.xml .
COPY src ./src
RUN npm install
RUN mvn clean package -Pproduction -DskipTests

FROM eclipse-temurin:21-jdk-jammy

WORKDIR /app

COPY --from=builder /app/target/*.jar app.jar

ENTRYPOINT ["java", "-jar", "app.jar"]