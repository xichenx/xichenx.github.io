

function $(id){return document.getElementById(id);}

function Init(){
CreateAjax();
//document.onmousemove=getMousePosition;
Start();
}


var xmlhttp;

function CreateAjax(){

    xmlhttp=null;
    if (window.XMLHttpRequest){
      xmlhttp=new XMLHttpRequest(); 
    }else if(window.ActiveXObject){
      xmlhttp=new ActiveXObject("Microsoft.XMLHTTP");
}
	
}


function LoadPage(Url,Process)
{
	_datahander=Process;
	xmlhttp.open("GET", Url,true);
	xmlhttp.onreadystatechange = Recieve;
	xmlhttp.send(null);


}


var _datahander;

function Recieve() 
{
if (xmlhttp.readyState == 4) {
	if (xmlhttp.status == 200) {
		_datahander();
	} 
	else{
		//alert("获取数据异常：" + xmlhttp.status);
	}
}
}



var _arr=new Array();
var _rows;

function Parse(SData)
{



_arr.length=0;

var bulks=SData.split("\x1e");


for(var i=0;i<bulks.length-1;i++){

	_arr[i]=bulks[i].split("\x1f");

	//_arr[i]=new Array();

	//var lines=bulks[i].split("\x1e");

	//for(var j=0;j<lines.length-1;j++){
		
	//	var segs=lines[j].split("\x1f");

	//	_arr[i][segs[0]]=segs[1];

	//}

	//_arr[i]["id"]=lines[j];

}

_rows=bulks[i];

}

