import sbt.Keys.*

ThisBuild / scalaVersion := "2.12.12"
ThisBuild / organization := "dp.la"

val SPARK_VERSION = "3.5.3"

lazy val proj = (project in file("."))
  .settings(
    name := "Thumbnail API Tester",
    resolvers += "SparkPackages" at "https://dl.bintray.com/spark-packages/maven/",
    libraryDependencies += "org.apache.spark" %% "spark-core" % SPARK_VERSION % "provided",
    libraryDependencies +="org.apache.spark" %% "spark-sql" % SPARK_VERSION % "provided",
    libraryDependencies +="org.apache.spark" %% "spark-mllib" % SPARK_VERSION % "provided"
  )
