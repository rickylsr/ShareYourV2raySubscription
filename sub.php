<?php
    $file = ''; //在这里填写存储普通线路订阅源文件的路径
    $file_premium = '';//在这里填写存储premium线路订阅源文件的路径
    function removeComment($content){
        return preg_replace("/(<!--[\w\W\r\n]*?-->)/s", '', str_replace(array("\r\n", "\r"), "\n", $content));

    };
    function removeVmess($content){
        return preg_replace("~\nvmess://.*~", '', $content);
    };
    function removeSS($content){
        return preg_replace("~\nss://.*~", '', $content);
    };
    
    $str = file_get_contents($file, "r") or die("Unable to open file!");
    if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY)=="level=premium") {
       $str = file_get_contents($file_premium, "r") or die("Unable to open file!");
    }
    if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY)=="type=ss") {
       echo base64_encode(removeVmess(removeComment($str)));
    }
    else if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY)=="type=vmess") {
       echo base64_encode(removeSS(removeComment($str)));
    }else{
        echo base64_encode(removeComment($str));
    };
    
?>
