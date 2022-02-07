<?php

// configuration
$url = '';
$file = '';
$file_premium = '';
$key = '';
$key_md5 = '';
$shareurl = '';

function removeComment($content){
        // (\/\*.*\*\/)|(#.*?\n)|(\/\/.*?\n)|
        //这里使用<!-- -->注释为例,其他注释可正则替换
        return preg_replace("/(<!--[\w\W\r\n]*?-->)/s", '', str_replace(array("\r\n", "\r"), "\n", $content));

};

function autoremarks($string){
    $string = removeComment($string);
    $array = preg_split("/\r\n|\n|\r/", $string);
    $array = array_filter($array);
    $array = array_values($array);
    $num = count($array);//计数,共有多少个地址
    $array_names = $array;
    for($i=0;$i<$num;++$i)
    {
        if (str_contains($array_names[$i], "vmess://")) {
            $array_names[$i] = base64_decode(substr($array_names[$i], 8));//先截取前缀
            $obj = json_decode($array_names[$i]); 
            $array_names[$i] = "<!--".$obj->{'ps'}."--->";//再base64 decode
        }else {
            $array_names[$i] = "<!--".urldecode(substr(strrchr($array_names[$i], '#'), 1))."--->";
            //shadowsocks链接直接截取remarks
        } //遍历地址数组,将地址全部转换为json（第一遍）
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
    //先截取前缀,再base64 decode
      //遍历地址数组,将地址全部转换为json（第一遍）
    //}
    return $string_new;
};

// check if form has been submitted
if (isset($_POST['accesskey']))
{
    // save the text contents
    if ($_POST['dontsavekeytf']=='yes'){
        file_put_contents($key, '');
    }else{
        file_put_contents($key,$_POST['accesskey']);
    };
    file_put_contents($key_md5, md5($_POST['accesskey']));

    // redirect to form again
    header(sprintf('Location: %s', $url));
    printf('<a href="%s">Moved</a>.', htmlspecialchars($url));
    exit();
}
if (isset($_POST['text']))
{
    // save the text contents

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
$text_key = file_get_contents($key);
$text_key_md5 = file_get_contents($key_md5);


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
    <!--<script src="https://stackpath.bootstrapcdn.com/bootstrap/3.4.1/js/bootstrap.min.js" integrity="sha384-aJ21OjlMXNL5UyIl/XNwTMqvzeRMZH2w8c5cRVpzpU8Y5bApTppSuUkhZXN0VxHd" crossorigin="anonymous"></script>-->


</head>

<body>
    <div class="container"> 
        <div class="page-header"><!--标题部分---->
            <h2>公共订阅编辑器</h2>
        </div>
        <p>支持 VMESS 和 SS 分享链接。每行放一个链接。每次保存,自动解析生成每条分享链接对应的别名</p>
        
        <form action="" method="post"><!--文本框部分---->
            <div class ="form-group">
                        <!--<textarea name="text" type="text" style="width:600px;height:400px;overflow-x:visible;overflow-y:visible;">-->
                        <label for="accesskey">分享密钥</label>
                        <input name="accesskey" id="accesskey" type="text" class="form-control" value="<?php echo htmlspecialchars($text_key); ?>"></input>
                        <div id="emailHelp" class="form-text">密钥以MD5形式保存,如果忘记可以在本页面重设</div>
                        <br><input class="form-check-input" type="checkbox" value="yes" name="dontsavekeytf" id="savekeytf" />
                        <label class="form-check-label" for="savekeytf">不明文保存密码(勾选并保存将清除以前明文存储的密码）</label>
                        
                        <br>
                <button type="submit" class="btn btn-primary" name="action" onclick=""/>立即保存</button>
                <input type="reset" class="btn btn-default"/>
                <button type="button" class="btn btn-success" onclick="generatesharelink()">生成分享链接</button>
                <button type="button" class="btn btn-success" onclick="generatepwd()">一键生成密钥</button>
                </form>
                <br><br>
                <form class="form-horizontal">       
                    <div class ="form-group">
                        <!--<label for="sharelink_premium">分享链接（Premium）</label>-->
                    <div class="col-sm-8">
                        <input name="sharelink_premium" id="sharelink_premium" type="text" class="form-control"></input>
                    </div>
                    <div class="col-sm-4"><button type="button" class="btn btn-success" onclick="copysharelink()">复制Premium分享链接</button></div>
                </div>
                    <div class ="form-group">
                        <!--<label for="sharelink">分享链接（普通）</label>-->
                    <div class="col-sm-8">
                        <input name="sharelink" id="sharelink" type="text" class="form-control"></input>
                    </div>
                    <div class="col-sm-4"><button type="button" class="btn btn-success" onclick="copysharelink2()">复制普通线路分享链接</button></div>
                </div>
                </form>
                <script>
                    function generatesharelink() {
                        /* Get the text field */
                        var url='<?php echo htmlspecialchars($shareurl)?>';
                        document.getElementById('sharelink_premium').value = url + '?key=' + document.getElementById('accesskey').value + '&level=premium';
                        document.getElementById('sharelink').value = url + '?key=' + document.getElementById('accesskey').value;
                    };
                    
                    function copysharelink() {
                        var copyText = document.getElementById('sharelink_premium');
                        
                        /* Select the text field */
                        copyText.select();
                        copyText.setSelectionRange(0, 99999); /* For mobile devices */

                        /* Copy the text inside the text field */
                        //navigator.clipboard.writeText(copyText.value);
  
                        /* Alert the copied text */
                        alert("Copied the text: " + copyText.value+ "【请别忘记点击保存】");
                        };
                        
                    function copysharelink2() {
                        var copyText = document.getElementById('sharelink');
                        
                        /* Select the text field */
                        copyText.select();
                        copyText.setSelectionRange(0, 99999); /* For mobile devices */

                        /* Copy the text inside the text field */
                        //navigator.clipboard.writeText(copyText.value);
  
                        /* Alert the copied text */
                        alert("Copied the text: " + copyText.value + "【请别忘记点击保存】");
                        };
                          
                    function generatepwd() {
                            var pasArr = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','0','1','2','3','4','5','6','7','8','9'];
                            var password = '';
                            var pasArrLen = pasArr.length;
                            for (var i=0; i<16; i++){
                                var x = Math.floor(Math.random()*pasArrLen);
                                password += pasArr[x];
                            }
                            document.getElementById('accesskey').value = password;
                            generatesharelink();
                        };
                        
                    </script>
                
            </div><br><br>

            <form action="" method="post"><!--文本框部分---->
                <div  class ="form-group">
                    <h3>Premium 线路</h3>
                    <div>
                        <!--<textarea name="text" type="text" style="width:600px;height:400px;overflow-x:visible;overflow-y:visible;">-->
                        <textarea name="text_premium" id="text_premium" type="text" class="form-control"  rows="18"><?php echo htmlspecialchars($text_premium) ?></textarea>
                         <br>
                    </div>
                </div>
                <input type="submit" class="btn btn-primary" name="action" onclick="savev2ray_premium();"/>
                <input type="reset" class="btn btn-default"/>
            </form><br><br><br>
        <div ><h3>普通线路</h3></div>
            <div>
                <form action="" method="post">
                    <div class ="form-group">
                        <!--<textarea name="text" type="text" style="width:600px;height:400px;overflow-x:visible;overflow-y:visible;">-->
                        <textarea name="text" id="text" type="text" class="form-control"  rows="18"><?php echo htmlspecialchars($text) ?></textarea>
                         <br>
                    </div>
                <input type="submit" class="btn btn-primary" name="action2" onclick="savev2ray();"/>
                <input type="reset" class="btn btn-default"/>
                </form> 
            </div><br>
            </div>
            <footer class="footer"><!--脚注部分---->
            <div class="container">
                <p class="text-muted">Help is on the way.</p>
            </div>
        </footer>
</body>
