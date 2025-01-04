import java.io.InputStream
import org.apache.spark.SparkConf
import org.apache.spark.sql.SparkSession

import java.net.URI
import java.net.http.{HttpClient, HttpRequest, HttpResponse}
import scala.util.{Failure, Success, Try, Using}


object TestIds {

  def main(args: Array[String]): Unit = {
    val sparkConf = new SparkConf()
      .setAppName("TestIds")

    val spark = SparkSession.builder()
      .config(sparkConf)
      .getOrCreate()

    import spark.implicits._
    val fraction = args(0).toFloat
    val ids = spark.read.text(args(1))
    val endpoint = args(2)
    ids
      .sample(fraction)
      .mapPartitions(rows => checkIds(rows.map(row => row.getString(0)), endpoint))
      .write
      .csv(args(3))
    spark.close()

  }

  def checkIds(ids: Iterator[String], endpoint: String): Iterator[Result] = {
    val client = HttpClient.newHttpClient
    ids.map(id => {checkId(id, endpoint, client)})
  }

  def checkId(id: String, endpoint: String, client: HttpClient): Result = Try {
    val url = s"$endpoint$id"
    val request = HttpRequest.newBuilder().uri(new URI(url)).build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofInputStream())
    val status = response.statusCode()
    val contentType = response.headers().firstValue("Content-Type").orElse("Unknown")

    Using(response.body()) { bodyInputStream =>
      countBytes(bodyInputStream, 1024)
    } match {
      case Success(size) =>
        Result(id, status, contentType, size, "")
      case Failure(e) =>
        System.err.println("Failed to size body for " +  id + ", message: " + e.getMessage)
        Result(id, status, contentType, -1, e.getMessage)
    }
  }.getOrElse({
    System.err.println("Failed to connect for " + id)
    Result(id, -1, "Unknown", -1, "fatal")
  })

  def countBytes(inputStream: InputStream, bufferSize: Int): Long = {
    var result = 0L
    val buff = new Array[Byte](bufferSize)
    var bytesRead = 0
    while (bytesRead != -1 ) {
      bytesRead = inputStream.read(buff)
      result += bytesRead
    }
    result
  }
}


case class Result(id: String, status: Int, contentType: String, size: Long, error: String)