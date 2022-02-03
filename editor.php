<?php

// configuration
$url = ''; //在这里填写url
$file = ''; //在这里填写存储普通线路订阅源文件的路径
$file_premium = '';//在这里填写存储premium线路订阅源文件的路径

function removeComment($content){
        return preg_replace("/(<!--[\w\W\r\n]*?-->)/s", '', str_replace(array("\r\n", "\r"), "\n", $content));
};

function autoremarks($string){
    $string = removeComment($string);
    $array = preg_split("/\r\n|\n|\r/", $string);
    $array = array_filter($array);
    $array = array_values($array);
    $num = count($array);//计数，共有多少个地址
    $array_names = $array;
    for($i=0;$i<$num;++$i)
    {
        if (str_contains($array_names[$i], "vmess://")) {
            $array_names[$i] = base64_decode(substr($array_names[$i], 8));//先截取前缀再base64 decode
            $obj = json_decode($array_names[$i]); //解码json
            $array_names[$i] = "<!--".$obj->{'ps'}."--->";/
        }else {
            $array_names[$i] = "<!--".urldecode(substr(strrchr($array_names[$i], '#'), 1))."--->";
            //shadowsocks链接直接截取remarks
        } 
    }
    $string_new = "";
    for($i=0;$i<$num;++$i)
    {
            $string_new=$string_new."\n".$array_names[$i]."\n".$array[$i]."\n";
    }
    
    //debug 用的显示模组
    //for($i=0;$i<$num;++$i)
    //{
    //   echo $array_names[$i];
    //先截取前缀，再base64 decode
      //遍历地址数组，将地址全部转换为json（第一遍）
    //}
    return $string_new;
}

// check if form has been submitted
if (isset($_POST['text']))
{

    file_put_contents($file, autoremarks($_POST['text']));

    // redirect to form again
    header(sprintf('Location: %s', $url));
    printf('<a href="%s">Moved</a>.', htmlspecialchars($url));
    exit();
}
if (isset($_POST['text_premium']))
{
    // save the text contents
    file_put_contents($file_premium, autoremarks($_POST['text_premium']));

    // redirect to form again
    header(sprintf('Location: %s', $url));
    printf('<a href="%s">Moved</a>.', htmlspecialchars($url));
    exit();
}
// read the textfile
$text = file_get_contents($file);
$text_premium = file_get_contents($file_premium);


?>
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1 user-scalable=no">
    <!-- The above 3 meta tags *must* come first in the head; any other head content must come *after* these tags -->
    <meta name="description" content="">
    <meta name="author" content="">

    <title>MySub公共订阅编辑器</title>

    <!-- Bootstrap core CSS -->
    <link href="bootstrap/css/bootstrap.min.css" rel="stylesheet">

    <!-- Custom styles for this template -->
    <link href="bootstrap/css/thispage.css" rel="stylesheet">


</head>

<body>
    <div class="container"> 
        <div class="page-header"><!--标题部分---->
            <h2>公共订阅编辑器</h2>
        </div>
        <p>支持 VMESS 和 SS 分享链接。每行放一个链接。每次保存，自动解析生成每条分享链接对应的别名</p>
        <h3>线路</h3>
          <form action="" method="post"><!--文本框部分---->
                <div>
                    <div class ="form-group">
                        <!--<textarea name="text" type="text" style="width:600px;height:400px;overflow-x:visible;overflow-y:visible;">-->
                        <textarea name="text_premium" id="text_premium" type="text" class="form-control"  rows="18"><?php echo htmlspecialchars($text_premium) ?></textarea>
                         <br><br>
                    </div>
                </div>
                <input type="submit" class="btn btn-primary" name="action" onclick="savev2ray_premium();"/>
                <input type="reset" class="btn btn-default"/>
            </form>
        <div><h3>普通线路</h3></div>
            <div>
                <form action="" method="post">
                    <div class ="form-group">
                        <!--<textarea name="text" type="text" style="width:600px;height:400px;overflow-x:visible;overflow-y:visible;">-->
                        <textarea name="text" id="text" type="text" class="form-control"  rows="18"><?php echo htmlspecialchars($text) ?></textarea>
                         <br><br>
                    </div>
                <input type="submit" class="btn btn-primary" name="action2" onclick="savev2ray();"/>
                <input type="reset" class="btn btn-default"/>
                </form> 
            </div>
            </div>
            <footer class="footer"><!--脚注部分---->
            <div class="container">
                <p class="text-muted">Help is on the way.</p>
            </div>
        </footer>
</body>
