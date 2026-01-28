/**
 * SkillsPage
 *
 * Skills management and listing
 */

import { useEffect, useState } from "react";
import { request } from "../api/client";

interface Skill {
  id: string;
  name: string;
  description?: string;
  category: string;
  enabled: boolean;
  version?: string;
  createdAt: string;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const fetchSkills = async () => {
      try {
        const data = await request<{ skills: Skill[] }>({
          url: "/api/skills",
          method: "GET",
        });
        setSkills(data.skills || []);
      } catch (error) {
        console.error("Failed to fetch skills:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSkills();
  }, []);

  const categories = ["all", ...new Set(skills.map((s) => s.category))];
  const filteredSkills =
    filter === "all" ? skills : skills.filter((s) => s.category === filter);

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      integration: "bg-blue-100 text-blue-800",
      automation: "bg-green-100 text-green-800",
      analysis: "bg-purple-100 text-purple-800",
      communication: "bg-yellow-100 text-yellow-800",
    };
    return colors[category] || "bg-gray-100 text-gray-800";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading skills...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Skills</h1>
          <p className="text-gray-600">
            Manage agent skills and capabilities
          </p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
          Add Skill
        </button>
      </div>

      <div className="mb-6 flex gap-2 flex-wrap">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilter(category)}
            className={`px-4 py-2 rounded-lg font-medium capitalize ${
              filter === category
                ? "bg-indigo-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {filteredSkills.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">🛠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              No skills found
            </h2>
            <p className="text-gray-600">
              Add skills to extend agent capabilities
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {skill.name}
                  </h3>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getCategoryBadge(
                      skill.category
                    )}`}
                  >
                    {skill.category}
                  </span>
                </div>
                <span
                  className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    skill.enabled
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {skill.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {skill.description && (
                <p className="text-sm text-gray-600 mb-4">{skill.description}</p>
              )}
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>v{skill.version || "1.0.0"}</span>
                <button className="text-indigo-600 hover:text-indigo-800">
                  Configure
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
