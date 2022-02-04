<?php
    $file = ''; //在这里填写存储普通线路订阅源文件的路径
    $file_premium = '';//在这里填写存储premium线路订阅源文件的路径
    $key_md5 = '';//声明密码key的MD5

    function removeComment($content){
        return preg_replace("/(<!--[\w\W\r\n]*?-->)/s", '', str_replace(array("\r\n", "\r"), "\n", $content));

    };
    function removeVmess($content){
        return preg_replace("~\nvmess://.*~", '', $content);
    };
    function removeSS($content){
        return preg_replace("~\nss://.*~", '', $content);
    };
    $url_query = parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY);
    if(strpos($url_query, 'key')!==false){
        parse_str($url_query, $key_from_url);
    } else {
        $key_from_url = array( "key"=>"");
    };
    
    if ($key_md5 == md5($key_from_url["key"])) {//判断url中是否传入key
        
    if (strpos(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), 'level=premium')!==false) {
       $str = file_get_contents($file_premium, "r") or die("Unable to open file!");
    } else {
        $str = file_get_contents($file, "r") or die("Unable to open file!");
    }
    
    if (strpos(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), 'type=ss')!==false) {
       echo base64_encode(removeVmess(removeComment($str)));
    }
    else if (strpos(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY), 'type=vmess')!==false) {
       echo base64_encode(removeSS(removeComment($str)));
    }else{
        echo base64_encode(removeComment($str));
    };
    };
?>
