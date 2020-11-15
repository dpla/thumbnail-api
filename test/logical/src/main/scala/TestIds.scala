import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

import scalaj.http._
import org.apache.spark.SparkConf
import org.apache.spark.sql.{Row, SparkSession}

import scala.io.Source

object TestIds {

  def main(args: Array[String]): Unit = {
    val sparkConf = new SparkConf()
      .setAppName("TestIds")
      .setMaster("local[*]")
      .set("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
      .set("spark.kryoserializer.buffer.max", "200")

    val spark = SparkSession.builder()
      .config(sparkConf)
      .getOrCreate()

    import spark.implicits._

    val ids = spark.read.text(args(0))

    ids.sample(0.001).map(
      (row: Row) => {
        val id = row.getString(0)
        val url = s"http://thumb.us-east-1.elasticbeanstalk.com/thumb/${id}"
        try {
          val response: HttpResponse[String] = Http(url).asString
          val status = response.code
          val body = response.body
          val contentType = response.headers.getOrElse("Content-Type", "")
          val size = body.length
          f"$id,$status,$contentType,$size"
        } catch {
          case e: Exception => f"$id,${e.getMessage}"
        }
      }
    ).write.text(args(1))

    spark.close()

  }

}