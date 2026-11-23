package com.jxau.pocket;

import org.json.*;
import org.jsoup.Jsoup;
import org.jsoup.nodes.*;
import org.jsoup.safety.*;
import java.net.URI;
import java.util.*;

/** Parse the captured ordinary homework form; never execute upstream JavaScript. */
public final class ChaoxingWorkDocument {
    final String base;
    String action="",reason="";
    final LinkedHashMap<String,String> fields=new LinkedHashMap<>();
    final JSONArray questions=new JSONArray();
    final List<Question> specs=new ArrayList<>();
    final Set<String> audioIds=new LinkedHashSet<>();
    boolean writable, submitted;
    int expectedCount;
    static final Safelist SAFE=new Safelist().addTags("p","br","b","strong","i","em","u","s","sub","sup","span","div","ul","ol","li","table","thead","tbody","tr","td","th","blockquote","pre","code","img").addAttributes("img","src","alt").addAttributes("td","colspan","rowspan").addAttributes("th","colspan","rowspan").addProtocols("img","src","https");
    static final class Question {
        String id,type,textField=""; int blanks; final List<String> options=new ArrayList<>();final List<Question> children=new ArrayList<>();final List<String> itemIds=new ArrayList<>();
    }
    public static boolean media(String value){
        try{URI u=URI.create(value);String h=u.getHost();return "https".equalsIgnoreCase(u.getScheme())&&u.getUserInfo()==null&&(u.getPort()==-1||u.getPort()==443)&&h!=null&&(h.equals("chaoxing.com")||h.endsWith(".chaoxing.com")||h.equals("cldisk.com")||h.endsWith(".cldisk.com"));}catch(Exception e){return false;}
    }
    static Element first(Element e,String... sels){for(String s:sels){Element n=e.selectFirst(s);if(n!=null)return n;}return null;}
    static String value(Element root,String id){Element e=root.getElementById(id);return e==null?"":e.val();}
    String rich(Element el){
        if(el==null)return "";Element e=el.clone();
        e.select("script,style,noscript,iframe,object,embed,form,button,input,textarea,select").remove();
        for(Element img:e.select("img")){
            String raw=img.attr("data-original");if(raw.isEmpty())raw=img.attr("src");String url="";
            try{url=URI.create(base).resolve(raw).toString();if(url.startsWith("http://"))url="https://"+url.substring(7);}catch(Exception ignored){}
            if(!media(url)){img.replaceWith(new TextNode("[图片地址暂不支持]"));block("存在无法显示的题目图片，请在学习通完成本次作业");}else img.attr("src",url);
        }
        Document clean=new Cleaner(SAFE).clean(Jsoup.parseBodyFragment(e.html(),base));clean.outputSettings().prettyPrint(false);return clean.body().html();
    }
    void block(String why){if(reason.isEmpty())reason=why;writable=false;}
    String savedText(String html){
        Document d=Jsoup.parse(html);if(d.selectFirst("img,iframe,object,embed,audio,video,a[href]")!=null)block("已存草稿含非文字内容，请在学习通继续作答");return d.body().text();
    }
    ChaoxingWorkDocument(String url){base=url;}
    public static ChaoxingWorkDocument parse(String html,String url)throws Exception{
        Document doc=Jsoup.parse(html,url);
        if(url.contains("passport2.")||doc.selectFirst("input[type=password]")!=null)throw new Exception("学习通登录已失效，请重新绑定");
        if(doc.text().contains("无权限的操作")||doc.text().contains("无效的用户"))throw new Exception("学习通未授权读取这份作业");
        ChaoxingWorkDocument out=new ChaoxingWorkDocument(url);
        Element form=doc.selectFirst("form#submitForm");out.writable=form!=null;
        if(form!=null){
            out.action=URI.create(url).resolve(form.attr("action")).toString();
            if(!ChaoxingParser.trusted(out.action)||!URI.create(out.action).getPath().equals("/mooc-ans/work/addStudentWorkNewWeb")||!"post".equalsIgnoreCase(form.attr("method")))out.block("当前作业提交方式尚未适配");
            for(Element input:form.select("input[type=hidden][name]")){
                String name=input.attr("name");
                if(name.matches("courseId|classId|knowledgeid|cpi|workRelationId|workAnswerId|jobid|standardEnc|enc_work|totalQuestionNum|pyFlag|answerwqbid|mooc2|randomOptions|workTimesEnc"))out.fields.put(name,input.val());
            }
            for(String k:new String[]{"courseId","classId","cpi","workRelationId","workAnswerId","standardEnc","enc_work","totalQuestionNum"})if(!out.fields.containsKey(k)||out.fields.get(k).isEmpty())out.block("作业表单信息不完整，暂不能保存或提交");
            // The captured page supplies the authoritative ordered question list in ready2Submit/saveWork.
            java.util.regex.Matcher qm=java.util.regex.Pattern.compile("var\\s+qids\\s*=\\s*[\"']([0-9,]+)[\"']").matcher(html);
            String ids=qm.find()?qm.group(1):"";
            if(ids.isEmpty()){
                qm=java.util.regex.Pattern.compile("\\$\\([\"']#questionIds[\"']\\)\\.val\\([\"']([0-9,]+)[\"']\\)").matcher(html);
                if(qm.find())ids=qm.group(1);
            }
            if(ids.isEmpty())out.block("无法核对完整题号，暂不能提交");else out.fields.put("answerwqbid",ids);
            try{int adds=Integer.parseInt(value(doc,"addTimes")),limit=Integer.parseInt(value(doc,"limitWorkSubmitTimes"));if(adds>limit)out.block("学习通要求提交验证码，请在学习通完成");}catch(Exception e){out.block("无法确认提交校验条件，请在学习通完成");}
        }
        // Individual questions take precedence over their shared .TiMu/.mark_item wrapper.
        List<Element> nodes=doc.select(".questionLi");
        if(nodes.isEmpty())nodes=doc.select(".question-item, [data-question-id]");
        for(Element node:nodes){
            boolean child=false;for(Element p:node.parents())if(p.hasClass("questionLi")){child=true;break;}if(child)continue;
            Question spec=new Question();spec.id=node.attr("data");
            if(spec.id.isEmpty())spec.id=node.id().replaceFirst("^question","");
            Element typ=node.selectFirst("input[name^=answertype]");spec.type=typ==null?"":typ.val();
            JSONObject q=out.parseQuestion(node,spec);
            out.specs.add(spec);out.questions.put(q);
            if(out.questions.length()>300){out.block("题目数量超出当前支持范围");break;}
        }
        out.expectedCount=out.questions.length();
        String declared=out.fields.get("answerwqbid");
        if(form!=null&&declared!=null){
            List<String> actual=new ArrayList<>();for(Question q:out.specs)actual.add(q.id);
            List<String> expected=new ArrayList<>();for(String id:declared.split(","))if(!id.isEmpty())expected.add(id);
            if(!expected.equals(actual)||new HashSet<>(actual).size()!=actual.size())out.block("题目数量或顺序未能完整核对，暂不能提交");
        }
        if(out.questions.length()==0)out.block("尚未读取到完整题目，当前页面不支持作答");
        // Result pages are read-only. A prompt/view path alone never proves a successful submission.
        out.submitted=form==null&&URI.create(url).getPath().endsWith("/work/view")&&doc.selectFirst(".stuAnswerContent,.mark_answer")!=null;
        if(form==null)out.block(out.submitted?"这份作业已提交，当前展示批阅内容":"本页尚未提供可作答表单，请在学习通确认作业状态");
        return out;
    }
    JSONObject parseQuestion(Element node,Question q)throws Exception{
        Element stem=first(node,".mark_name",".reader_answer_tit",".question-title",".stem");
        if(stem==null)block("部分题干未能完整读取，请在学习通完成");
        JSONArray audio=new JSONArray();
        for(Element frame:node.select("iframe")){
            String src=frame.attr("src");java.util.regex.Matcher m=java.util.regex.Pattern.compile("[?&]objectid=([a-fA-F0-9]{32})(?:&|$)").matcher(src);
            if(src.contains("/ananas/common-modules/audioplay/audioplay.html")&&m.find()){
                String object=m.group(1);audio.put(object);audioIds.add(object);
                try{if(Integer.parseInt(frame.attr("playtimeslimit"))>0)block("此音频有播放次数限制，请在学习通完成");}catch(NumberFormatException ignored){}
            }else block("存在未适配的音视频或附件，请在学习通完成");
        }
        if(node.selectFirst("object,embed,video,audio,input[type=file]")!=null)block("存在未适配的附件，请在学习通完成");
        for(Element link:node.select("a[href]"))if(!link.attr("href").equals("javascript:;")&&!link.attr("href").equals("#"))block("存在未适配的附件链接，请在学习通完成");
        JSONObject json=new JSONObject().put("id",q.id).put("type",q.type).put("stem",rich(stem)).put("audio",audio);
        JSONArray opts=new JSONArray(),blanks=new JSONArray(),children=new JSONArray();
        if(q.type.equals("0")||q.type.equals("1")||q.type.equals("3")){
            Set<String> seen=new HashSet<>();
            for(Element option:node.select(".answerBg")){
                Element label=option.selectFirst(".num_option[data]");if(label==null)continue;
                String key=label.attr("data");if(!(q.type.equals("3")?key.matches("true|false"):key.matches("[A-Z]"))||!seen.add(key)){block("选项结构尚未适配");continue;}
                q.options.add(key);opts.put(new JSONObject().put("value",key).put("html",rich(first(option,".answer_p"))));
            }
            if(opts.length()<2)block("选择题选项未能完整读取");
            if(q.type.equals("3")&&(!seen.contains("true")||!seen.contains("false")||seen.size()!=2))block("判断题选项值无法核对");
            String old=value(node,"answer"+q.id);
            if(q.type.equals("1")){
                JSONArray selected=new JSONArray();Set<String> restored=new HashSet<>();
                for(int i=0;i<old.length();i++){String key=old.substring(i,i+1);if(!q.options.contains(key)||!restored.add(key))block("多选题已有答案格式尚未适配");else selected.put(key);}
                json.put("answer",selected);
            }else{if(!old.isEmpty()&&!q.options.contains(old))block("已有选择答案格式尚未适配");json.put("answer",old);}
        }else if(q.type.equals("4")||q.type.equals("6")){
            // Keep the exact text control's name; do not guess mobile or attachment submission fields.
            Element editor=node.selectFirst("textarea[name=answerEditor"+q.id+"],textarea[name=answer"+q.id+"]");
            if(editor==null)block("文字题作答控件尚未适配，请在学习通完成");
            else{
                q.textField=editor.attr("name");
                if(node.select("textarea").size()!=1)block("文字题包含多个编辑区，暂不能提交");
                json.put("answer",savedText(editor.val()));
            }
        }else if(q.type.equals("2")){
            Element count=node.selectFirst("input[name=tiankongsize"+q.id+"]");if(count==null)count=node.ownerDocument().getElementById("blankNum"+q.id);
            try{q.blanks=Integer.parseInt(count==null?"0":count.val());}catch(Exception ignored){}
            if(q.blanks<1||q.blanks>150)block("填空题结构未能完整读取");
            if(node.select("textarea[name^=answerEditor]").size()!=q.blanks)block("填空数量无法核对");
            for(int i=1;i<=q.blanks&&i<=150;i++){Element f=node.getElementById("answerEditor"+q.id+i);if(f==null)block("部分填空控件缺失");blanks.put(f==null?"":savedText(f.val()));}
            json.put("answer",blanks);
        }else if(q.type.equals("19")){
            for(Element item:node.select("[itemId][qtype]")){
                // Captured reading questions use either a choice or multiple text blanks.
                String itemId=item.attr("itemId");if(q.itemIds.contains(itemId))continue;
                Question child=new Question();child.id=item.attr("data");child.type=item.attr("qtype");
                if(!child.type.equals("0")&&!child.type.equals("2"))block("此阅读题包含尚未适配的子题");
                if(child.id.isEmpty()||itemId.isEmpty())block("阅读题子题标识不完整");
                JSONObject childJson=parseQuestion(item,child);childJson.put("itemId",itemId);children.put(childJson);q.children.add(child);q.itemIds.add(itemId);
            }
            if(children.length()==0)block("阅读题子题尚未适配");
            String old=value(node,"answer"+q.id);
            if(!old.trim().isEmpty())try{
                JSONArray saved=new JSONArray(old);JSONObject savedItems=saved.optJSONObject(0);
                if(saved.length()!=1||savedItems==null)throw new Exception();
                for(int n=0;n<children.length();n++){
                    JSONObject c=children.getJSONObject(n),item=savedItems.optJSONObject(q.itemIds.get(n));if(item==null)continue;
                    if(c.optString("type").equals("2")){
                        JSONArray a=item.optJSONArray("answer");if(a==null||a.length()!=q.children.get(n).blanks)throw new Exception();
                        JSONArray restored=new JSONArray();for(int j=0;j<a.length();j++)restored.put(savedText(a.getJSONObject(j).getString("content")));c.put("answer",restored);
                    }else c.put("answer",item.optString("answer"));
                }
            }catch(Exception e){block("已有阅读题草稿尚未适配，请在学习通继续作答");}
            json.put("answer",new JSONObject());
        }else if(writable)block("本次作业含未适配题型，暂不支持保存或提交");
        json.put("options",opts).put("children",children);
        if(!writable||q.type.isEmpty()){
            Element reviewNode=node.clone();reviewNode.select("[itemId][qtype]").remove();
            Element review=first(reviewNode,".mark_answer");
            Map<String,Element> parts=new LinkedHashMap<>();for(String key:new String[]{"mine","correct","analysis","feedback","unclassified"})parts.put(key,new Element("div"));
            if(review!=null)splitReview(review,parts,new String[]{"unclassified"});
            Element mine=first(reviewNode,".stuAnswerContent"),correct=first(reviewNode,".rightAnswerContent"),analysis=first(reviewNode,".mark_analysis .analysisContent",".analysisContent",".answerAnalysis");
            if(mine!=null)parts.get("mine").html(mine.html());
            if(correct!=null)parts.get("correct").html(correct.html());
            if(analysis!=null)parts.get("analysis").html(analysis.html());
            JSONObject structured=new JSONObject();for(Map.Entry<String,Element> p:parts.entrySet())structured.put(p.getKey(),rich(p.getValue()));
            if(review!=null||mine!=null||correct!=null||analysis!=null)json.put("reviewParts",structured).put("review","");
            if(opts.length()==0){
                Element list=first(reviewNode,".mark_letter");JSONArray options=new JSONArray();boolean valid=list!=null;Set<String> keys=new HashSet<>();
                if(list!=null)for(Element li:list.children()){
                    Element content=li.clone();String text=content.text();java.util.regex.Matcher m=java.util.regex.Pattern.compile("^\\s*([A-Z])[.．、:：)）]\\s*").matcher(text);
                    if(!m.find()||!keys.add(m.group(1))){valid=false;break;}String key=m.group(1);
                    // Remove only the leading option label, preserving nested images and formatting.
                    for(TextNode t:content.textNodes())if(t.text().matches("^\\s*"+key+"[.．、:：)）].*")){t.text(t.text().replaceFirst("^\\s*"+key+"[.．、:：)）]\\s*",""));break;}
                    options.put(new JSONObject().put("value",key).put("html",rich(content)).put("placeholder",content.select("img").isEmpty()&&content.text().trim().equals(key)));
                }
                if(valid&&options.length()>=2)json.put("reviewOptions",options);else json.put("optionReview",rich(list));
            }
            String kind="0".equals(q.type)?"single":"1".equals(q.type)?"multiple":"";
            if(kind.isEmpty()&&stem!=null){String text=stem.text();if(text.matches("(?s).*[(（]\\s*单选题.*"))kind="single";else if(text.matches("(?s).*[(（]\\s*多选题.*"))kind="multiple";}
            json.put("choiceKind",kind);
        }
        return json;
    }
    private static final java.util.regex.Pattern REVIEW_LABEL=java.util.regex.Pattern.compile("(我的答案|学生答案|正确答案|参考答案|答案解析|教师评语|批语|解析)\\s*[:：]");
    /** Keep unknown material separately; never guess that it is the student's answer. */
    private static void splitReview(Node node,Map<String,Element> parts,String[] active){
        if(node instanceof TextNode){
            String text=((TextNode)node).getWholeText();java.util.regex.Matcher m=REVIEW_LABEL.matcher(text);int start=0;
            while(m.find()){
                if(m.start()>start)parts.get(active[0]).appendChild(new TextNode(text.substring(start,m.start())));
                String label=m.group(1);active[0]=label.equals("我的答案")||label.equals("学生答案")?"mine":label.equals("正确答案")||label.equals("参考答案")?"correct":label.equals("解析")||label.equals("答案解析")?"analysis":"feedback";
                start=m.end();
            }
            if(start<text.length())parts.get(active[0]).appendChild(new TextNode(text.substring(start)));return;
        }
        if(!(node instanceof Element))return;Element el=(Element)node;
        if(el.tagName().matches("script|style|noscript|input|textarea|button"))return;
        if(!REVIEW_LABEL.matcher(el.text()).find()){parts.get(active[0]).appendChild(el.clone());return;}
        for(Node child:el.childNodes())splitReview(child,parts,active);
    }
    public LinkedHashMap<String,String> encode(JSONObject answers,boolean submit)throws Exception{
        if(!writable)throw new Exception(reason);
        if(answers==null||answers.length()!=specs.size())throw new Exception("答案与题目不一致，请重新打开作业");
        LinkedHashMap<String,String> result=new LinkedHashMap<>(fields);
        result.put("pyFlag",submit?"":"1");
        for(Question q:specs){
            result.put("answertype"+q.id,q.type);
            Object a=answers.opt(q.id);
            if(q.type.equals("0")||q.type.equals("3")){String answer=choice(q,a,submit);result.put("answer"+q.id,answer);}
            else if(q.type.equals("1")){
                if(!(a instanceof JSONArray))throw new Exception("多选答案格式不正确");
                Set<String> selected=new HashSet<>();JSONArray values=(JSONArray)a;
                for(int i=0;i<values.length();i++){Object v=values.get(i);if(!(v instanceof String)||!q.options.contains(v)||!selected.add((String)v))throw new Exception("多选答案选项无效或重复");}
                if(submit&&selected.isEmpty())throw new Exception("请完成所有题目再提交");
                StringBuilder answer=new StringBuilder();for(String option:q.options)if(selected.contains(option))answer.append(option);
                result.put("answer"+q.id,answer.toString());
            }else if(q.type.equals("4")||q.type.equals("6")){
                if(!(a instanceof String)||((String)a).length()>20000)throw new Exception("文字答案格式无效或内容过长");
                String text=(String)a;if(submit&&text.trim().isEmpty())throw new Exception("请完成文字题再提交");
                if(q.textField.isEmpty())throw new Exception("文字题作答字段缺失");
                result.put(q.textField,q.textField.startsWith("answerEditor")?"<p>"+org.jsoup.nodes.Entities.escape(text).replace("\n","<br>")+"</p>":text);
            }
            else if(q.type.equals("2")){
                if(!(a instanceof JSONArray)||((JSONArray)a).length()!=q.blanks)throw new Exception("填空数量不一致");
                result.put("tiankongsize"+q.id,String.valueOf(q.blanks));
                for(int i=0;i<q.blanks;i++){
                    Object v=((JSONArray)a).get(i);if(!(v instanceof String))throw new Exception("填空格式无效");String text=(String)v;
                    if(text.length()>20000)throw new Exception("填空内容过长");if(submit&&text.trim().isEmpty())throw new Exception("请完成全部填空再提交");
                    result.put("answerEditor"+q.id+(i+1),"<p>"+org.jsoup.nodes.Entities.escape(text).replace("\n","<br>")+"</p>");
                }
            }else if(q.type.equals("19")){
                if(!(a instanceof JSONObject)||((JSONObject)a).length()!=q.children.size())throw new Exception("阅读题答案不完整");
                JSONObject answer=new JSONObject();for(int i=0;i<q.children.size();i++){
                    Question c=q.children.get(i);Object v=((JSONObject)a).opt(c.id);Object encoded;
                    if(c.type.equals("0"))encoded=choice(c,v,submit);else{
                        if(!(v instanceof JSONArray)||((JSONArray)v).length()!=c.blanks)throw new Exception("阅读题填空数量不一致");
                        JSONArray fill=new JSONArray();for(int j=0;j<c.blanks;j++){
                            Object raw=((JSONArray)v).get(j);if(!(raw instanceof String)||((String)raw).length()>20000)throw new Exception("阅读题填空格式无效");
                            String text=(String)raw;if(submit&&text.trim().isEmpty())throw new Exception("请完成阅读题所有填空再提交");
                            fill.put(new JSONObject().put("name",String.valueOf(j+1)).put("content","<p>"+org.jsoup.nodes.Entities.escape(text).replace("\n","<br>")+"</p>"));
                        }encoded=fill;
                    }
                    answer.put(q.itemIds.get(i),new JSONObject().put("type",Integer.parseInt(c.type)).put("answer",encoded));
                }
                result.put("answer"+q.id,new JSONArray().put(answer).toString());
            }else throw new Exception("未适配题型，无法提交");
        }
        return result;
    }
    static String choice(Question q,Object a,boolean submit)throws Exception{
        if(!(a instanceof String))throw new Exception("单选答案格式不正确");String s=(String)a;
        if(!s.isEmpty()&&!q.options.contains(s))throw new Exception("答案选项无效");
        if(submit&&s.isEmpty())throw new Exception("请完成所有题目再提交");return s;
    }
}
