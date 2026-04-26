

function $(id){return document.getElementById(id);}

//document.onmousemove=getMousePosition;

function LoadPage(url,func) 
{
var xhr= new XMLHttpRequest();
xhr.open("GET", url,true); 
xhr.onreadystatechange = function() { 
   if(xhr.readyState ==4 && (xhr.status==200||xhr.status==304)){ 
        func(xhr.responseText); 
   }
};
xhr.send(null);
}


var _arr=new Array();
var _rows;


var _pgno; 

function List(pn)
{
_pgno=pn;

LoadPage("data.php?m=10&n="+pn,Show);
}




function Show(SData)
{


_arr.length=0;

var bulks=SData.split("\x1e");


for(var i=0;i<bulks.length-1;i++){

	_arr[i]=bulks[i].split("\x1f");


}

_rows=bulks[i];




for(i=0;i<_arr.length;i++){

		var person=document.createElement("div")

		person.innerHTML="<b>"+_arr[i][1]+"</b>于"+new Date(_arr[i][3]*1000).toLocaleString()+"说：";
		$("list").appendChild(person);

		var main=document.createElement("div")
		main.className="main";

		var says=document.createElement("span");
		says.innerText=_arr[i][2];
		says.className="says";
		main.appendChild(says);

		var sid=document.createElement("span");
		sid.innerText=_arr[i][0];
		sid.className="sid";
		main.appendChild(sid);


		$("list").appendChild(main);


}	


var pages=Math.ceil(_rows/10);


if(_pgno<pages){
	$("page").innerHTML="<a href=javascript:List("+(_pgno+1)+")>更多...</a>";
}
else{
	$("page").innerHTML="";
}




}


List(1);




