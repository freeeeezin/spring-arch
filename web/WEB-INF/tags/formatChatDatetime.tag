<%@ tag body-content="empty" pageEncoding="utf-8" %>
<%@ tag import="com.util.TimeFormatter" %>
<%@ tag trimDirectiveWhitespaces="true" %>
<%@ attribute name="value" required="true" type="java.time.LocalDateTime" %>
<%= TimeFormatter.TimeFormatChatTimeString(value) %>