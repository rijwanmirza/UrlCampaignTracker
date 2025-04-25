import React from "react";
import { ErrorLogList } from "@/components/logs/error-log-list";

export default function ApiLogsPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-2xl font-bold mb-6">API Error Logs</h1>
      <p className="mb-6 text-gray-600">
        View and manage TrafficStar API error logs. This page shows errors that occurred during API operations and their retry status.
      </p>
      <ErrorLogList />
    </div>
  );
}