import sbt.Keys._

ThisBuild / scalaVersion := "2.12.10"
ThisBuild / organization := "org.dpla"

lazy val hello = (project in file("."))
  .settings(
    name := "Hello",
    resolvers += "SparkPackages" at "https://dl.bintray.com/spark-packages/maven/",
    libraryDependencies += "com.eed3si9n" %% "gigahorse-okhttp" % "0.3.1",
    libraryDependencies += "org.apache.spark" %% "spark-core" % "2.4.7",
    libraryDependencies +="org.apache.spark" %% "spark-sql" % "2.4.7",
    libraryDependencies +="org.apache.spark" %% "spark-mllib" % "2.4.7"
  )
