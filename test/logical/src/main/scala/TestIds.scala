import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

import okhttp3.{OkHttpClient, Request}
import org.apache.spark.SparkConf
import org.apache.spark.sql.{Row, SparkSession}

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
          val request = new Request.Builder().url(url).build()
          val response = HttpClientHolder.httpClient.newCall(request).execute()
          val status = response.code()
          val body = response.body()
          val contentType = body.contentType()
          val size = body.bytes().length
          f"$id,$status,$contentType,$size"
        } catch {
          case e: Exception => f"$id,${e.getMessage}"
        }
      }
    ).write.text(args(1))

    spark.close()

  }

}

object HttpClientHolder extends Serializable {
  @transient val httpClient = new OkHttpClient.Builder()
    .connectTimeout(20, TimeUnit.SECONDS)
    .readTimeout(20, TimeUnit.SECONDS)
    .retryOnConnectionFailure(true)
    .followRedirects(true)
    .build()
}